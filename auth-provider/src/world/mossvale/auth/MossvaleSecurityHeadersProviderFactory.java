package world.mossvale.auth;

import java.net.URI;
import java.util.Set;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.core.MediaType;
import org.keycloak.headers.DefaultSecurityHeadersProvider;
import org.keycloak.headers.DefaultSecurityHeadersProviderFactory;
import org.keycloak.headers.SecurityHeadersProvider;
import org.keycloak.models.ContentSecurityPolicyBuilder;
import org.keycloak.models.KeycloakSession;

/** Permit only the game's registered embedded callback to frame its own sign-in. */
public final class MossvaleSecurityHeadersProviderFactory extends DefaultSecurityHeadersProviderFactory {
    private static final Set<String> GAME_ORIGINS = Set.of("https://mossvale.world", "https://us.mossvale.world", "https://asia.mossvale.world");

    static String parentOrigin(KeycloakSession session) {
        var context = session.getContext();
        var auth = context.getAuthenticationSession();
        if (auth == null || context.getRealm() == null || context.getClient() == null
                || !"mossvale".equals(context.getRealm().getName())
                || !"mossvale-browser".equals(context.getClient().getClientId())
                || !context.getRealm().equals(auth.getRealm()) || !context.getClient().equals(auth.getClient())) return null;
        String redirect = auth.getRedirectUri();
        if (redirect == null || !context.getClient().getRedirectUris().contains(redirect)) return null;
        try {
            URI uri = URI.create(redirect);
            if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || !"/auth-callback.html".equals(uri.getRawPath())) return null;
            String origin = uri.getScheme() + "://" + uri.getRawAuthority();
            if (GAME_ORIGINS.contains(origin)) return origin;
            // Disposable/local Keycloak can frame only an explicitly registered loopback callback.
            URI authBase = context.getUri().getBaseUri();
            if ("http".equals(uri.getScheme()) && loopback(uri.getHost()) && uri.getPort() > 0 && uri.getPort() <= 65535
                    && "http".equals(authBase.getScheme()) && loopback(authBase.getHost())) return origin;
        } catch (IllegalArgumentException ignored) { }
        return null;
    }

    private static boolean loopback(String host) { return "127.0.0.1".equals(host) || "localhost".equals(host) || "[::1]".equals(host); }

    @Override public int order() { return 1; }

    @Override public SecurityHeadersProvider create(KeycloakSession session) {
        return new DefaultSecurityHeadersProvider(session) {
            @Override public void addHeaders(ContainerRequestContext request, ContainerResponseContext response) {
                super.addHeaders(request, response);
                if (response.getMediaType() == null || !MediaType.TEXT_HTML_TYPE.isCompatible(response.getMediaType())) return;
                String origin = parentOrigin(session);
                if (origin == null) return;
                var headers = response.getHeaders();
                Object existing = headers.getFirst("Content-Security-Policy");
                if (existing == null) return;
                headers.putSingle("Content-Security-Policy", ContentSecurityPolicyBuilder.create(existing.toString())
                        .frameAncestors("'self' " + origin).build());
                headers.remove("X-Frame-Options");
            }
        };
    }
}
