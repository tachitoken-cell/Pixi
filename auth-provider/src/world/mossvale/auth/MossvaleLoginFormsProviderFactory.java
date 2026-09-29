package world.mossvale.auth;

import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.forms.login.freemarker.FreeMarkerLoginFormsProviderFactory;
import org.keycloak.models.KeycloakSession;

public final class MossvaleLoginFormsProviderFactory extends FreeMarkerLoginFormsProviderFactory {
    @Override public LoginFormsProvider create(KeycloakSession session) { return new MossvaleLoginFormsProvider(session); }
    @Override public int order() { return 1; }
}
