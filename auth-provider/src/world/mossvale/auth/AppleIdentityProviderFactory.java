package world.mossvale.auth;

import org.jboss.logging.Logger;
import org.keycloak.broker.oidc.OIDCIdentityProvider;
import org.keycloak.broker.oidc.OIDCIdentityProviderConfig;
import org.keycloak.broker.oidc.OIDCIdentityProviderFactory;
import org.keycloak.models.FederatedIdentityModel;
import org.keycloak.models.IdentityProviderModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.provider.ProviderEvent;

public final class AppleIdentityProviderFactory extends OIDCIdentityProviderFactory {
    public static final String ID = "mossvale-apple";
    private static final Logger LOG = Logger.getLogger(AppleIdentityProviderFactory.class);

    @Override public String getId() { return ID; }
    @Override public String getName() { return "Sign in with Apple"; }
    @Override public OIDCIdentityProvider create(KeycloakSession session, IdentityProviderModel model) {
        return new AppleIdentityProvider(session, new OIDCIdentityProviderConfig(model));
    }

    @Override public void postInit(KeycloakSessionFactory factory) {
        factory.register(AppleIdentityProviderFactory::onEvent);
    }

    static void onEvent(ProviderEvent event) {
        if (event instanceof UserModel.UserPreRemovedEvent removed) {
            KeycloakSession session = removed.getKeycloakSession();
            session.users().getFederatedIdentitiesStream(removed.getRealm(), removed.getUser()).toList()
                    .forEach(link -> revokeLink(session, removed.getRealm(), link));
        } else if (event instanceof FederatedIdentityModel.FederatedIdentityRemovedEvent removed) {
            revokeLink(removed.getKeycloakSession(), removed.getRealm(), removed.getFederatedIdentity());
        }
    }

    static void revokeLink(KeycloakSession session, RealmModel realm, FederatedIdentityModel link) {
        RealmModel previous = session.getContext().getRealm();
        try {
            // Admin tokens may belong to master; look up the provider in the user's realm.
            session.getContext().setRealm(realm);
            IdentityProviderModel model = session.identityProviders().getByAlias(link.getIdentityProvider());
            if (model == null || !ID.equals(model.getProviderId())) return;
            if (link.getToken() == null || link.getToken().isBlank()) {
                // Apple TN3194: missing historical credentials must not prevent account deletion.
                LOG.warn("Apple link has no stored token; account deletion/unlink will continue. Manual Apple revocation is required.");
                return;
            }
            AppleIdentityProvider.revoke(session, model.getConfig().get("clientId"), link.getToken());
        } catch (RuntimeException error) {
            session.getTransactionManager().setRollbackOnly();
            throw error;
        } finally {
            session.getContext().setRealm(previous);
        }
    }
}
