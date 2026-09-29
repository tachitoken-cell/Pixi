package world.mossvale.auth;

import java.lang.reflect.Proxy;
import java.lang.reflect.InvocationHandler;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.Response;
import org.apache.http.HttpEntityEnclosingRequest;
import org.apache.http.HttpHost;
import org.apache.http.HttpRequest;
import org.apache.http.HttpVersion;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.conn.ClientConnectionManager;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.message.BasicHttpResponse;
import org.apache.http.params.HttpParams;
import org.apache.http.protocol.HttpContext;
import org.apache.http.util.EntityUtils;
import org.keycloak.broker.oidc.OIDCIdentityProviderConfig;
import org.keycloak.broker.provider.AuthenticationRequest;
import org.keycloak.broker.provider.IdentityBrokerException;
import org.keycloak.broker.provider.UserAuthenticationIdentityProvider.AuthenticationCallback;
import org.keycloak.broker.provider.util.IdentityBrokerState;
import org.keycloak.connections.httpclient.HttpClientProvider;
import org.keycloak.crypto.AsymmetricSignatureVerifierContext;
import org.keycloak.crypto.KeyWrapper;
import org.keycloak.crypto.SignatureProvider;
import org.keycloak.jose.jws.JWSBuilder;
import org.keycloak.jose.jws.JWSInput;
import org.keycloak.models.*;
import org.keycloak.provider.ProviderEvent;
import org.keycloak.provider.ProviderEventListener;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.keycloak.util.JsonSerialization;

/** Assertion checks against real Keycloak classes; HTTP transport and users are in-memory only. */
public final class AppleProviderCheck {
    static KeyPair key;
    static int httpCalls, httpStatus = 200, stateChecks;
    static boolean rollback;
    static ProviderEventListener listener;
    static final String CLIENT = "world.mossvale.game.signin";
    @SuppressWarnings("unchecked")
    static <T> T proxy(Class<T> type, InvocationHandler call) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class[]{type}, call);
    }
    static void check(boolean ok) { if (!ok) throw new AssertionError(); }
    static void fails(Runnable action) {
        try { action.run(); throw new AssertionError("Expected failure"); }
        catch (RuntimeException expected) { check(!expected.toString().contains("PRIVATE KEY")); }
    }
    static Map<String, String> params(String body) {
        Map<String, String> result = new HashMap<>();
        for (String part : body.split("&")) {
            String[] pair = part.split("=", 2);
            result.put(java.net.URLDecoder.decode(pair[0], StandardCharsets.UTF_8), java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
        }
        return result;
    }
    static void verifySecret(String jwt) throws Exception {
        String[] parts = jwt.split("\\.");
        var header = JsonSerialization.mapper.readTree(Base64.getUrlDecoder().decode(parts[0]));
        var claims = JsonSerialization.mapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
        check(header.get("alg").asText().equals("ES256") && header.get("kid").asText().equals("KEYID12345"));
        check(claims.get("sub").asText().equals(CLIENT) && claims.get("iss").asText().equals("TEAM123456"));
        check(claims.get("aud").asText().equals("https://appleid.apple.com"));
        check(claims.get("exp").asLong() - claims.get("iat").asLong() == 330);
        check(claims.get("exp").asLong() > Instant.now().getEpochSecond());
        Signature verifier = Signature.getInstance("SHA256withECDSAinP1363Format");
        verifier.initVerify(key.getPublic()); verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        check(verifier.verify(Base64.getUrlDecoder().decode(parts[2])));
    }
    static final CloseableHttpClient client = new CloseableHttpClient() {
        @Override protected CloseableHttpResponse doExecute(HttpHost host, HttpRequest request, HttpContext context) throws java.io.IOException {
            try {
                check(host.toURI().equals("https://appleid.apple.com"));
                check(request.getRequestLine().getUri().equals("https://appleid.apple.com/auth/revoke") || request.getRequestLine().getUri().equals("/auth/revoke"));
                Map<String, String> body = params(EntityUtils.toString(((HttpEntityEnclosingRequest) request).getEntity()));
                check(body.get("client_id").equals(CLIENT)); check(body.get("token").equals("fixture-refresh"));
                check(body.get("token_type_hint").equals("refresh_token")); verifySecret(body.get("client_secret")); httpCalls++;
                var response = new BasicHttpResponse(HttpVersion.HTTP_1_1, httpStatus, "fixture");
                response.setEntity(new StringEntity("{}", StandardCharsets.UTF_8));
                return proxy(CloseableHttpResponse.class, (p, method, args) -> method.getName().equals("close") ? null : method.invoke(response, args));
            } catch (Exception error) { throw new java.io.IOException("Fixture transport check failed", error); }
        }
        @Override public void close() {}
        @Override public HttpParams getParams() { return null; }
        @Override public ClientConnectionManager getConnectionManager() { return null; }
    };

    public static void main(String[] args) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC"); generator.initialize(new ECGenParameterSpec("secp256r1")); key = generator.generateKeyPair();
        String pem = "-----BEGIN PRIVATE KEY-----\n" + Base64.getEncoder().encodeToString(key.getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----\n";
        Path file = Path.of(System.getenv("APPLE_SSO_PRIVATE_KEY_FILE")); Files.writeString(file, pem);
        Files.setPosixFilePermissions(file, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        verifySecret(AppleIdentityProvider.clientSecret(CLIENT, System.getenv()));
        fails(() -> AppleIdentityProvider.clientSecret(CLIENT, Map.of()));
        fails(() -> AppleIdentityProvider.clientSecret(CLIENT, Map.of("APPLE_SSO_TEAM_ID", "TEAM123456", "APPLE_SSO_KEY_ID", "KEYID12345", "APPLE_SSO_PRIVATE_KEY", "invalid private fixture")));
        var envPem = new HashMap<>(System.getenv()); envPem.remove("APPLE_SSO_PRIVATE_KEY_FILE"); envPem.put("APPLE_SSO_PRIVATE_KEY", pem);
        verifySecret(AppleIdentityProvider.clientSecret(CLIENT, envPem));
        var badCurve = KeyPairGenerator.getInstance("EC"); badCurve.initialize(new ECGenParameterSpec("secp384r1"));
        envPem.put("APPLE_SSO_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\n" + Base64.getEncoder().encodeToString(badCurve.generateKeyPair().getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----");
        fails(() -> AppleIdentityProvider.clientSecret(CLIENT, envPem));

        IdentityProviderModel model = new IdentityProviderModel(); model.setAlias("apple"); model.setProviderId(AppleIdentityProviderFactory.ID);
        model.setEnabled(true);
        model.setConfig(new HashMap<>(Map.of("clientId", CLIENT, "authorizationUrl", "https://wrong.invalid", "tokenUrl", "https://wrong.invalid", "disableNonce", "true")));
        var stored = new FederatedIdentityModel("apple", "apple-subject", "fixture", "{\"refresh_token\":\"fixture-refresh\",\"access_token\":\"fixture-access\"}");
        var transaction = proxy(KeycloakTransactionManager.class, (p, method, a) -> { if (method.getName().equals("setRollbackOnly")) rollback = true; return null; });
        var idps = proxy(IdentityProviderStorageProvider.class, (p, method, a) -> model);
        var users = proxy(UserProvider.class, (p, method, a) -> Stream.of(stored));
        var notes = new HashMap<String, String>();
        var authSession = proxy(AuthenticationSessionModel.class, (p, method, a) -> switch (method.getName()) {
            case "setClientNote" -> { notes.put((String)a[0], (String)a[1]); yield null; }
            case "getClientNote" -> notes.get((String)a[0]); default -> null;
        });
        var context = proxy(KeycloakContext.class, (p, method, a) -> switch (method.getName()) {
            case "getAuthenticationSession" -> authSession;
            case "getAuthServerUrl" -> java.net.URI.create("https://auth.example.test/custom-auth/"); default -> null;
        });
        var http = proxy(HttpClientProvider.class, (p, method, a) -> method.getName().equals("getHttpClient") ? client : method.getReturnType() == long.class ? 1024L : null);
        var verifier = proxy(SignatureProvider.class, (p, method, a) -> method.getName().equals("verifier") ? new AsymmetricSignatureVerifierContext((KeyWrapper)a[0]) : null);
        var session = proxy(KeycloakSession.class, (p, method, a) -> switch (method.getName()) {
            case "getContext" -> context; case "getTransactionManager" -> transaction; case "identityProviders" -> idps;
            case "users" -> users; case "getProvider" -> a[0] == SignatureProvider.class ? verifier : http; default -> null;
        });
        var apple = new AppleIdentityProvider(session, new OIDCIdentityProviderConfig(model));
        check(apple.getConfig().isValidateSignature() && !apple.getConfig().isDisableNonce());
        check(apple.getConfig().isStoreToken() && !apple.getConfig().isAddReadTokenRoleOnCreate());
        var state = IdentityBrokerState.decoded("fixture-state", "browser", "tab", "data", null);
        var url = apple.createAuthorizationUrl(new AuthenticationRequest(session, null, authSession, null, null, state, "https://auth.invalid/callback")).build();
        check(url.getHost().equals("appleid.apple.com"));
        var query = params(url.getRawQuery()); check(query.get("scope").equals("email")); check(query.get("response_mode").equals("form_post"));
        check(query.get("nonce").equals(notes.get("BROKER_NONCE"))); check(!query.containsKey("code_challenge"));
        fails(() -> apple.getFederatedIdentity("{\"access_token\":\"fixture\"}"));
        fails(() -> apple.getFederatedIdentity("{\"access_token\":\"fixture\",\"refresh_token\":\" \"}"));
        var rsa = KeyPairGenerator.getInstance("RSA"); rsa.initialize(2048); var signingKey = rsa.generateKeyPair();
        KeyWrapper publicKey = new KeyWrapper(); publicKey.setAlgorithm("RS256"); publicKey.setKid("fixture-rsa"); publicKey.setPublicKey(signingKey.getPublic());
        var jwtProvider = new AppleIdentityProvider(session, new OIDCIdentityProviderConfig(model)) {
            @Override protected KeyWrapper getIdentityProviderKeyWrapper(JWSInput token) { return publicKey; }
        };
        Map<String, Object> claims = new HashMap<>(Map.of("iss", "https://appleid.apple.com", "sub", "apple-user-fixture", "aud", CLIENT,
                "exp", Instant.now().getEpochSecond() + 60, "iat", Instant.now().getEpochSecond(), "nonce", query.get("nonce"), "email", "apple-fixture@example.test"));
        java.util.function.Supplier<String> response = () -> {
            try { return JsonSerialization.writeValueAsString(Map.of("access_token", "fixture-access", "refresh_token", "fixture-refresh",
                    "id_token", new JWSBuilder().kid("fixture-rsa").jsonContent(claims).rsa256(signingKey.getPrivate()))); }
            catch (Exception error) { throw new AssertionError(error); }
        };
        var identity = jwtProvider.getFederatedIdentity(response.get());
        jwtProvider.preprocessFederatedIdentity(session, null, identity);
        check(identity.getId().equals("apple-user-fixture") && identity.getEmail().equals("apple-fixture@example.test") && identity.getToken().contains("fixture-refresh"));
        claims.put("aud", "wrong-client"); fails(() -> jwtProvider.getFederatedIdentity(response.get())); claims.put("aud", CLIENT);
        claims.put("iss", "https://wrong.invalid"); fails(() -> jwtProvider.getFederatedIdentity(response.get())); claims.put("iss", "https://appleid.apple.com");
        claims.put("exp", Instant.now().getEpochSecond() - 60); fails(() -> jwtProvider.getFederatedIdentity(response.get())); claims.put("exp", Instant.now().getEpochSecond() + 60);
        claims.put("nonce", "wrong-nonce"); fails(() -> jwtProvider.preprocessFederatedIdentity(session, null, jwtProvider.getFederatedIdentity(response.get())));
        claims.remove("nonce"); fails(() -> jwtProvider.preprocessFederatedIdentity(session, null, jwtProvider.getFederatedIdentity(response.get())));
        publicKey.setPublicKey(rsa.generateKeyPair().getPublic()); fails(() -> jwtProvider.getFederatedIdentity(response.get()));

        AuthenticationCallback callback = proxy(AuthenticationCallback.class, (p, method, a) -> {
            if (method.getName().equals("getAndVerifyAuthenticationSession")) { stateChecks++; throw new WebApplicationException(Response.status(401).build()); }
            throw new AssertionError("Unverified state must not authenticate");
        });
        var callbackRealm = proxy(RealmModel.class, (p, method, a) -> method.getName().equals("getName") ? "mossvale" : null);
        var endpoint = (AppleIdentityProvider.AppleEndpoint) apple.callback(callbackRealm, callback, null);
        var form = new MultivaluedHashMap<String, String>(); form.putSingle("state", "unverified-state"); form.putSingle("code", "fixture-code");
        var bounce = endpoint.formPost(form); check(bounce.getStatus() == 303 && stateChecks == 0);
        check(bounce.getLocation().getHost().equals("auth.example.test") && bounce.getLocation().getPath().equals("/custom-auth/realms/mossvale/broker/apple/endpoint"));
        check(bounce.getHeaderString("Cache-Control").equals("no-store") && bounce.getHeaderString("Referrer-Policy").equals("no-referrer"));
        check(endpoint.authResponse("unverified-state", "fixture-code", null, null).getStatus() == 401 && stateChecks == 1);
        form.add("state", "duplicate"); check(endpoint.formPost(form).getStatus() == 400 && stateChecks == 1);
        form.remove("state"); check(endpoint.formPost(form).getStatus() == 400 && stateChecks == 1);

        var factory = proxy(KeycloakSessionFactory.class, (p, method, a) -> { if (method.getName().equals("register")) listener = (ProviderEventListener)a[0]; return null; });
        new AppleIdentityProviderFactory().postInit(factory); check(listener != null);
        ProviderEvent delete = new UserModel.UserPreRemovedEvent() {
            public KeycloakSession getKeycloakSession() { return session; } public RealmModel getRealm() { return null; } public UserModel getUser() { return null; }
        };
        ProviderEvent unlink = new FederatedIdentityModel.FederatedIdentityRemovedEvent() {
            public KeycloakSession getKeycloakSession() { return session; } public RealmModel getRealm() { return null; } public UserModel getUser() { return null; }
            public FederatedIdentityModel getFederatedIdentity() { return stored; }
        };
        listener.onEvent(delete); check(httpCalls == 1 && !rollback);
        listener.onEvent(unlink); check(httpCalls == 2 && !rollback);
        httpStatus = 503; fails(() -> listener.onEvent(delete)); check(httpCalls == 3 && rollback);
        rollback = false; fails(() -> listener.onEvent(unlink)); check(httpCalls == 4 && rollback);
        stored.setToken(null); rollback = false; listener.onEvent(delete); check(!rollback && httpCalls == 4);
        model.setProviderId("google"); stored.setToken("must-not-send"); listener.onEvent(delete); check(httpCalls == 4);
        Files.deleteIfExists(file);
        System.out.println("PASS: Apple ES256 signatures, short-lived secrets, pinned OIDC/form POST/state, required token retention, deletion and unlink revocation with rollback and missing-token fallback.");
    }
}
