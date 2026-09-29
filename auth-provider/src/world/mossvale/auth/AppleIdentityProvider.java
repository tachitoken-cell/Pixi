package world.mossvale.auth;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.math.BigInteger;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;
import org.keycloak.broker.oidc.OIDCIdentityProvider;
import org.keycloak.broker.oidc.OIDCIdentityProviderConfig;
import org.keycloak.broker.provider.AuthenticationRequest;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.broker.provider.IdentityBrokerException;
import org.keycloak.http.simple.SimpleHttp;
import org.keycloak.events.EventBuilder;
import org.keycloak.http.simple.SimpleHttpRequest;
import org.keycloak.jose.jws.JWSInput;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.representations.AccessTokenResponse;
import org.keycloak.services.Urls;
import org.keycloak.util.JsonSerialization;

/** Apple's form POST is adapted to Keycloak's checked GET callback; no second identity/session implementation. */
public class AppleIdentityProvider extends OIDCIdentityProvider {
    static final String ISSUER = "https://appleid.apple.com";

    public AppleIdentityProvider(KeycloakSession session, OIDCIdentityProviderConfig config) {
        super(session, secureConfig(config));
    }

    static OIDCIdentityProviderConfig secureConfig(OIDCIdentityProviderConfig source) {
        OIDCIdentityProviderConfig config = new OIDCIdentityProviderConfig(source);
        config.setAuthorizationUrl(ISSUER + "/auth/authorize");
        config.setTokenUrl(ISSUER + "/auth/token");
        config.setIssuer(ISSUER);
        config.setJwksUrl(ISSUER + "/auth/keys");
        config.setValidateSignature(true);
        config.setUseJwksUrl(true);
        config.setDisableNonce(false);
        config.getConfig().put("disableUserInfo", "true");
        config.setPkceEnabled(false); // Apple has no broker PKCE; Mossvale -> Keycloak still requires S256.
        config.setStoreToken(true); // Required for revoke on account deletion and provider unlink.
        config.setAddReadTokenRoleOnCreate(false);
        config.getConfig().put("storeTokenInSession", "false");
        return config;
    }

    @Override
    protected UriBuilder createAuthorizationUrl(AuthenticationRequest request) {
        return super.createAuthorizationUrl(request)
                .replaceQueryParam("scope", "email")
                .replaceQueryParam("response_mode", "form_post");
    }

    @Override
    public Object callback(RealmModel realm, AuthenticationCallback callback, EventBuilder event) {
        return new AppleEndpoint(callback, realm, event, this);
    }

    @Override
    public SimpleHttpRequest authenticateTokenRequest(SimpleHttpRequest request) {
        return request.param("client_id", getConfig().getClientId())
                .param("client_secret", clientSecret(getConfig().getClientId(), System.getenv()));
    }

    @Override
    public BrokeredIdentityContext getFederatedIdentity(String response) {
        // Do not create a new Apple link that cannot later be revoked.
        try {
            String refreshToken = JsonSerialization.readValue(response, AccessTokenResponse.class).getRefreshToken();
            if (refreshToken == null || refreshToken.isBlank())
                throw new IdentityBrokerException("Apple did not return a revocable token.");
        } catch (java.io.IOException error) {
            throw new IdentityBrokerException("Invalid Apple token response.");
        }
        return super.getFederatedIdentity(response);
    }

    @Override protected boolean verify(JWSInput token) {
        return "RS256".equals(token.getHeader().getRawAlgorithm()) && super.verify(token);
    }

    static String clientSecret(String clientId, Map<String, String> env) {
        try {
            String team = env.get("APPLE_SSO_TEAM_ID"), keyId = env.get("APPLE_SSO_KEY_ID");
            if (team == null || !team.matches("[A-Z0-9]{10}") || keyId == null || !keyId.matches("[A-Z0-9]{10}")
                    || clientId == null || !clientId.matches("[A-Za-z0-9][A-Za-z0-9.-]{2,254}"))
                throw new IllegalArgumentException();
            String file = env.get("APPLE_SSO_PRIVATE_KEY_FILE"), pem = env.get("APPLE_SSO_PRIVATE_KEY");
            if (file != null && !file.isBlank()) {
                if (pem != null && !pem.isBlank() || Files.size(Path.of(file)) > 8192) throw new IllegalArgumentException();
                pem = Files.readString(Path.of(file));
            }
            if (pem == null || pem.length() > 8192 || !pem.contains("-----BEGIN PRIVATE KEY-----")) throw new IllegalArgumentException();
            byte[] bytes = Base64.getMimeDecoder().decode(pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", ""));
            ECPrivateKey key = (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(bytes));
            if (!key.getParams().getOrder().equals(new BigInteger("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)))
                throw new IllegalArgumentException();
            long now = Instant.now().getEpochSecond();
            var encoder = Base64.getUrlEncoder().withoutPadding();
            String header = encoder.encodeToString(JsonSerialization.writeValueAsBytes(Map.of("alg", "ES256", "kid", keyId)));
            String payload = encoder.encodeToString(JsonSerialization.writeValueAsBytes(Map.of("iss", team, "sub", clientId,
                    "aud", ISSUER, "iat", now - 30, "exp", now + 300)));
            String input = header + "." + payload;
            Signature signer = Signature.getInstance("SHA256withECDSAinP1363Format");
            signer.initSign(key); signer.update(input.getBytes(StandardCharsets.US_ASCII));
            return input + "." + encoder.encodeToString(signer.sign());
        } catch (Exception error) {
            // No key bytes, environment values, file paths, token or underlying exception in logs.
            throw new IdentityBrokerException("Apple signing credentials are missing or invalid.");
        }
    }

    static void revoke(KeycloakSession session, String clientId, String storedToken) {
        try {
            AccessTokenResponse tokens = JsonSerialization.readValue(storedToken, AccessTokenResponse.class);
            String token = tokens.getRefreshToken() != null ? tokens.getRefreshToken() : tokens.getToken();
            if (token == null || token.isBlank()) throw new IllegalArgumentException();
            int status = SimpleHttp.create(session).doPost(ISSUER + "/auth/revoke")
                    .param("client_id", clientId).param("client_secret", clientSecret(clientId, System.getenv()))
                    .param("token", token).param("token_type_hint", tokens.getRefreshToken() != null ? "refresh_token" : "access_token")
                    .asStatus();
            if (status != 200) throw new IllegalStateException();
        } catch (Exception error) {
            throw new IdentityBrokerException("Apple authorization could not be revoked; retry the operation.");
        }
    }

    public static final class AppleEndpoint extends OIDCEndpoint {
        private final AppleIdentityProvider apple;
        AppleEndpoint(AuthenticationCallback callback, RealmModel realm, EventBuilder event, AppleIdentityProvider provider) {
            super(callback, realm, event, provider);
            apple = provider;
        }

        @POST
        @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
        public Response formPost(MultivaluedMap<String, String> form) {
            for (String name : new String[]{"state", "code", "error"}) {
                var values = form.get(name);
                if (values != null && (values.size() != 1 || values.get(0) == null || values.get(0).length() > 16384))
                    return Response.status(400).build();
            }
            String state = form.getFirst("state"), code = form.getFirst("code"), error = form.getFirst("error");
            if (state == null || state.isBlank() || code == null && error == null || code != null && error != null)
                return Response.status(400).build();
            // Cross-site POST omits SameSite=Lax cookies. A top-level same-origin GET restores them;
            // only then does inherited authResponse verify the state/session and exchange the code.
            UriBuilder redirect = UriBuilder.fromUri(Urls.identityProviderAuthnResponse(session.getContext().getAuthServerUrl(),
                    apple.getConfig().getAlias(), realm.getName())).queryParam("state", state);
            if (code != null) redirect.queryParam("code", code);
            else redirect.queryParam("error", "user_cancelled_authorize".equals(error) ? "access_denied" : error);
            return Response.seeOther(redirect.build()).header("Cache-Control", "no-store")
                    .header("Referrer-Policy", "no-referrer").build();
        }
    }
}
