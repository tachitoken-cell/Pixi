package world.mossvale.auth;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import jakarta.ws.rs.core.Response;
import org.keycloak.OAuth2Constants;
import org.keycloak.broker.provider.IdpLinkAction;
import org.keycloak.forms.login.freemarker.FreeMarkerLoginFormsProvider;
import org.keycloak.forms.login.freemarker.model.UrlBean;
import org.keycloak.models.Constants;
import org.keycloak.models.KeycloakSession;
import org.keycloak.services.Urls;
import org.keycloak.services.messages.Messages;
import org.keycloak.services.resources.IdentityBrokerService;
import org.keycloak.theme.Theme;

/** Recover an ordinary account switch through Keycloak's session-scoped logout and restart. */
public final class MossvaleLoginFormsProvider extends FreeMarkerLoginFormsProvider {
    public MossvaleLoginFormsProvider(KeycloakSession session) { super(session); }

    @Override
    protected Response processTemplate(Theme theme, String templateName, Locale locale) {
        String origin = MossvaleSecurityHeadersProviderFactory.parentOrigin(session);
        if (origin != null && "mossvale".equals(theme.getName()) && attributes.get("url") instanceof UrlBean url) {
            // Metadata comes from Keycloak's validated authentication session, never a request query/referrer.
            String script;
            try { script = theme.getProperties().getProperty("mossvaleEmbeddedScript", "js/embedded.js"); }
            catch (IOException error) { throw new UncheckedIOException("Cannot read Mossvale theme properties", error); }
            addScript(url.getResourcesPath() + "/" + script + "?parent=" + URLEncoder.encode(origin, StandardCharsets.UTF_8));
        }
        return super.processTemplate(theme, templateName, locale);
    }

    @Override
    public Response createErrorPage(Response.Status status) {
        if (Messages.DIFFERENT_USER_AUTHENTICATED.equals(getFirstMessageUnformatted())
                && authenticationSession != null && realm != null && "mossvale".equals(realm.getName())
                && client != null && "mossvale-browser".equals(client.getClientId())
                && realm.equals(authenticationSession.getRealm()) && client.equals(authenticationSession.getClient())
                // Reauthentication and account linking must keep the original identity requirement.
                && authenticationSession.getClientNote(OAuth2Constants.MAX_AGE) == null
                && authenticationSession.getClientNote(Constants.KC_ACTION) == null
                && authenticationSession.getClientNote(Constants.KC_ACTION_EXECUTING) == null
                && authenticationSession.getClientNote(Constants.KC_ACTION_STATUS) == null
                && authenticationSession.getAuthNote(IdentityBrokerService.LINKING_IDENTITY_PROVIDER) == null
                && authenticationSession.getAuthNote(IdpLinkAction.KC_ACTION_LINKING_IDENTITY_PROVIDER) == null) {
            // The failed request rolls back. Logout must run in the next request, using Keycloak's
            // checked auth session URL; it recreates the root session and preserves state/nonce/PKCE.
            return Response.seeOther(Urls.realmLoginRestartPage(prepareBaseUriBuilder(true).build(), realm.getName(), false))
                    .header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer").build();
        }
        return super.createErrorPage(status);
    }
}
