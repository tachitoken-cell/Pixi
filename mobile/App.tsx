import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Image, Linking, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { fetch } from 'expo/fetch';
import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { useKeepAwake } from 'expo-keep-awake';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { authCallback, isAccountNavigation, isAuthNavigation, loadGame, nativeAuthRedirect, navigationAction, startAuthRequest, walletBrowsers, type AuthRequest, type WalletBrowser } from './navigation';
import { createNativeBridge, randomDocumentId } from './native-bridge';
import { createNativeServices } from './native-services';
import { openWalletBrowser } from './browser-wallet';
import { createTreasureWallet } from './treasure-wallet';
import { createNativeNotifications } from './notifications';
import { APP_STORE_URLS, type RequiredAppUpdate } from './app-update';

const configuredUrl = process.env.EXPO_PUBLIC_GAME_URL || 'https://mossvale.world/';
const appInfo = JSON.stringify({ platform: Platform.OS === 'ios' ? 'apple' : 'google', version: nativeApplicationVersion, build: nativeBuildVersion }).replace(/[\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16)}`);
const mobileScript = `window.__MOSSVALE_NATIVE_APP__ = ${appInfo}; window.__MOSSVALE_NATIVE__ = true; window.__MOSSVALE_NATIVE_AUTH__ = true; window.__MOSSVALE_NATIVE_SESSION__ = true; window.__MOSSVALE_NATIVE_WALLET_BROWSER__ = true; window.__MOSSVALE_NATIVE_AUTH_LINKS__ = true; true;`;

export default function App() {
  useKeepAwake();
  const webview = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const pageUrl = useRef(configuredUrl);
  const [attempt, setAttempt] = useState(0);
  const [game, setGame] = useState<Awaited<ReturnType<typeof loadGame>>>();
  const [requiredUpdate, setRequiredUpdate] = useState<RequiredAppUpdate>();
  const updateBlocked = useRef(requiredUpdate);
  updateBlocked.current = requiredUpdate;
  const [loading, setLoading] = useState(true);
  const [loadActivity, setLoadActivity] = useState(0);
  const loadProgress = useRef(0);
  const [error, setError] = useState('');
  const [walletPending, setWalletPending] = useState(false);
  const [treasurePending, setTreasurePending] = useState<'connect' | 'sign' | 'claim' | undefined>(undefined);
  const [chooseWallet, setChooseWallet] = useState<((wallet: WalletBrowser) => void) | undefined>(undefined);
  const walletAbort = useRef<AbortController | undefined>(undefined);
  const authRequest = useRef<AuthRequest | undefined>(undefined);
  const mounted = useRef(true);
  const bridgeRef = useRef<ReturnType<typeof createNativeBridge> | null>(null);
  const configuredAuth = useRef<Awaited<ReturnType<typeof loadGame>>['auth']>(undefined);
  configuredAuth.current = game?.auth;
  const services = useMemo(() => createNativeServices({ request: fetch, configuredAuth: () => configuredAuth.current, onEvent: event => bridgeRef.current?.event({ type: 'billing', ...event }) }), []);
  const notifications = useMemo(() => createNativeNotifications({ request: fetch, configuredUrl, development: __DEV__ }), []);
  const treasureWallet = useMemo(() => createTreasureWallet({
    blocked: () => !!authRequest.current,
    authorization: origin => services.accessToken(origin),
    choose: select => { if (mounted.current) setChooseWallet(() => select); },
    pending: value => { walletAbort.current = value?.controller; if (mounted.current) setTreasurePending(value?.kind); },
  }), [services]);
  const bridge = useMemo(() => createNativeBridge({
    configuredUrl, development: __DEV__, platform: Platform.OS === 'ios' ? 'apple' : 'google', randomId: randomDocumentId,
    send: script => webview.current?.injectJavaScript(script),
    execute: async request => {
      if (request.method === 'auth.clear' || request.method === 'billing.authorize' && request.params.accessToken === null) treasureWallet.clear();
      if (request.method.startsWith('notifications.')) return notifications.execute(request);
      if (request.method === 'auth.clear') {
        const [, result] = await Promise.allSettled([notifications.signOut(), services.execute(request)]);
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      }
      return request.method.startsWith('treasure.') ? treasureWallet.execute(request) : services.execute(request);
    },
    onNavigate: () => { services.clear(); treasureWallet.clear(); notifications.pause(); },
  }), [services, treasureWallet, notifications]);
  bridgeRef.current = bridge;
  const cancelAuth = useCallback(() => {
    if (!authRequest.current) return;
    authRequest.current = undefined;
    walletAbort.current?.abort(); walletAbort.current = undefined;
    try { WebBrowser.dismissAuthSession(); } catch { /* Expired native sessions may already be closed. */ }
  }, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelAuth(); bridge.invalidate(); void services.stop(); }; }, [bridge, services, cancelAuth]);
  useEffect(() => { notifications.start(); return () => notifications.stop(); }, [notifications]);
  useEffect(() => { if (error) { cancelAuth(); setWalletPending(false); setChooseWallet(undefined); bridge.invalidate(); } }, [error, bridge, cancelAuth]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      // Native fetch/body cancellation may not settle its promise.
      active = false;
      setError('Mossvale took too long to respond. Reconnecting automatically…');
      if (updateBlocked.current) setLoading(false);
      controller.abort();
    }, 15000);
    cancelAuth();
    setWalletPending(false);
    setChooseWallet(undefined);
    bridge.invalidate();
    setGame(undefined);
    setError('');
    setLoading(true);
    canGoBack.current = false;
    void (async () => {
      try {
        const nextGame = await loadGame(configuredUrl, __DEV__, fetch, controller.signal, { platform: Platform.OS === 'ios' ? 'apple' : 'google', version: nativeApplicationVersion, build: nativeBuildVersion });
        if (active) {
          setRequiredUpdate(nextGame.update);
          if (nextGame.update) setLoading(false);
          else setGame(nextGame);
        }
      } catch (cause) {
        if (active) {
          setError(controller.signal.aborted ? 'Mossvale took too long to respond. Reconnecting automatically…' : cause instanceof Error ? cause.message : 'Could not reach Mossvale. Reconnecting automatically…');
          if (updateBlocked.current) setLoading(false);
        }
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [attempt, bridge, cancelAuth]);

  useEffect(() => {
    if (!game || !loading || error) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Measure a foreground stall, not time spent downloading or in another app.
    const watch = () => {
      clearTimeout(timer);
      if (AppState.currentState === 'active') timer = setTimeout(() => {
        if (AppState.currentState === 'active') setError('The game took too long to load. Reconnecting automatically…');
      }, 30000);
    };
    watch();
    const subscription = AppState.addEventListener('change', watch);
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [game, loading, error, loadActivity]);

  useEffect(() => {
    if (!error || requiredUpdate) return;
    const retry = () => { if (AppState.currentState === 'active') setAttempt(value => value + 1); };
    const timer = setTimeout(retry, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') retry(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [error, attempt, requiredUpdate]);

  useEffect(() => {
    if (!requiredUpdate) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setAttempt(value => value + 1); });
    return () => subscription.remove();
  }, [requiredUpdate]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (updateBlocked.current) return true;
      if (walletAbort.current) { walletAbort.current.abort(); return true; }
      if (canGoBack.current && webview.current) webview.current.goBack();
      else Alert.alert('Leave Mossvale?', 'Your character will disconnect from the realm.', [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    });
    return () => subscription.remove();
  }, []);

  const openExternal = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert('Could not open link', 'No app is available to open this link.'));
  };

  const openAuth = (url: string) => {
    if (authRequest.current || treasureWallet.busy()) return false;
    let request: AuthRequest;
    try {
      if (!game?.auth) throw Error();
      request = startAuthRequest(url, pageUrl.current, game.auth, configuredUrl, __DEV__);
    } catch {
      webview.current?.injectJavaScript("window.dispatchEvent(new CustomEvent('mossvale:auth-result',{detail:{status:'error'}}));true;");
      Alert.alert('Sign-in could not open', 'Return to Mossvale and try signing in again.');
      return false;
    }
    authRequest.current = request;
    bridge.invalidate();
    setLoading(false);
    const inject = (script: string) => webview.current?.injectJavaScript(`if(window.top===window&&location.origin+location.pathname===${JSON.stringify(request.resumeUrl)}){${script}}true;`);
    // A hash-only navigation does not rerun Keycloak's callback parser.
    const resume = (callback: string) => inject(`history.replaceState(history.state,'',${JSON.stringify(callback)});location.reload();`);
    const failed = (status: 'cancelled' | 'error') => {
      if (request.silent) {
        const callback = new URL(request.resumeUrl);
        callback.hash = new URLSearchParams({ error: 'access_denied', state: request.state }).toString();
        resume(callback.href);
      } else {
        // Only the unchanged original page can regain its existing game-page permissions.
        bridge.navigate(pageUrl.current);
        webview.current?.injectJavaScript(bridge.script());
        inject(`window.dispatchEvent(new CustomEvent('mossvale:auth-result',{detail:{status:${JSON.stringify(status)}}}));`);
      }
    };
    void (async () => {
      try {
        let result;
        if (request.wallet) {
          const controller = new AbortController(); walletAbort.current = controller; setWalletPending(true);
          result = { type: 'success', url: await openWalletBrowser(request, controller.signal, select => { if (authRequest.current === request) setChooseWallet(() => select); }) };
        } else result = await WebBrowser.openAuthSessionAsync(request.url, nativeAuthRedirect);
        if (authRequest.current !== request) return;
        if (result.type !== 'success') { failed('cancelled'); return; }
        const callback = authCallback(request, result.url);
        const resultError = new URLSearchParams(new URL(callback).hash.slice(1)).get('error');
        if (resultError) { failed(resultError === 'access_denied' ? 'cancelled' : 'error'); return; }
        resume(callback);
      } catch (cause) {
        if (authRequest.current === request) {
          const cancelled = (cause as { code?: number })?.code === 4001;
          failed(cancelled ? 'cancelled' : 'error');
          if (request.wallet && !cancelled) Alert.alert('Wallet sign-in', cause instanceof Error ? cause.message : 'Wallet sign-in could not finish. Please try again.');
        }
      } finally {
        if (authRequest.current === request) { authRequest.current = undefined; walletAbort.current = undefined; setWalletPending(false); }
      }
    })();
    return false;
  };

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {chooseWallet && <Modal supportedOrientations={['landscape']} onRequestClose={() => walletAbort.current?.abort()}>
        <SafeAreaView style={styles.screen}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.walletPicker}>
            <Text accessibilityRole="header" style={styles.title}>Choose your wallet</Text>
            <Text style={styles.detail}>{treasurePending ? treasurePending === 'claim' ? 'Choose the wallet on your saved payout. Approve collecting MOSS in the wallet; ETH pays the network fee.' : 'Connect your voucher wallet. Linking does not spend MOSS.' : 'Sign in with your Ethereum address. No gas or payment.'}</Text>
            <View style={styles.walletOptions}>
              {walletBrowsers.map(wallet => <Pressable key={wallet.id} accessibilityRole="button" style={[styles.retry, styles.walletOption]} onPress={() => chooseWallet?.(wallet.id)}>
                <Text style={styles.retryText}>{wallet.name}</Text>
              </Pressable>)}
            </View>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => walletAbort.current?.abort()}><Text style={styles.retryText}>{treasurePending ? 'Cancel action' : 'Cancel sign-in'}</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>}
      {/* The game fills the display; its HTML HUD applies the device safe-area insets. */}
      <View style={styles.screen}>
        {game && !requiredUpdate && !error && <WebView
          key={attempt}
          ref={webview}
          style={styles.webview}
          source={{ uri: game.url }}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={request => {
            if (isAuthNavigation(request.url, game.auth) && (request.isTopFrame === false || !openAuth(request.url))) return false;
            if (request.isTopFrame === false) return true;
            if (isAccountNavigation(request.url, game.auth)) { openExternal(request.url); return false; }
            const action = navigationAction(request.url, game.origins);
            if (action === 'external') openExternal(request.url);
            // Keycloak removes its OAuth fragment within the same loaded document.
            if (action === 'internal' && (request.url === pageUrl.current || request.url.split('#')[0] !== pageUrl.current.split('#')[0])) { cancelAuth(); bridge.invalidate(); }
            return action === 'internal';
          }}
          onOpenWindow={({ nativeEvent }) => {
            if (isAuthNavigation(nativeEvent.targetUrl, game.auth)) { openAuth(nativeEvent.targetUrl); return; }
            const action = navigationAction(nativeEvent.targetUrl, game.origins);
            if (action === 'external' || action === 'internal') openExternal(nativeEvent.targetUrl);
          }}
          onNavigationStateChange={state => { canGoBack.current = state.canGoBack; }}
          injectedJavaScriptBeforeContentLoaded={mobileScript}
          injectedJavaScript={mobileScript}
          onMessage={({ nativeEvent }) => { void bridge.receive(nativeEvent.data, nativeEvent.url); }}
          onLoadStart={({ nativeEvent }) => {
            // Android also emits this for history.replaceState, without a matching load end.
            // Keycloak clears the callback fragment after the document has already loaded.
            if (Platform.OS === 'android' && nativeEvent.loading === false && nativeEvent.url !== pageUrl.current && nativeEvent.url.split('#')[0] === pageUrl.current.split('#')[0]) {
              pageUrl.current = nativeEvent.url;
              return;
            }
            loadProgress.current = 0; setLoadActivity(value => value + 1);
            cancelAuth(); setWalletPending(false); setChooseWallet(undefined); pageUrl.current = nativeEvent.url; bridge.navigate(nativeEvent.url); setLoading(true);
          }}
          onLoadProgress={({ nativeEvent }) => {
            webview.current?.injectJavaScript(bridge.script());
            if (nativeEvent.url.split('#')[0] === pageUrl.current.split('#')[0] && nativeEvent.progress > loadProgress.current && nativeEvent.progress <= 1) {
              loadProgress.current = nativeEvent.progress; setLoadActivity(value => value + 1);
            }
          }}
          onLoadEnd={() => { webview.current?.injectJavaScript(bridge.script()); setLoading(false); }}
          onError={() => setError('The game could not load. Reconnecting automatically…')}
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent.url === pageUrl.current) setError(`Mossvale is temporarily unavailable (HTTP ${nativeEvent.statusCode}). Reconnecting automatically…`);
          }}
          onContentProcessDidTerminate={() => setError('The game was paused by your device. Reconnect to continue.')}
          onRenderProcessGone={() => setError('The game was paused by your device. Reconnect to continue.')}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
          bounces={false}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          mixedContentMode="never"
          allowFileAccess={false}
          setSupportMultipleWindows
        />}
        {(requiredUpdate || loading || error || walletPending || treasurePending) && <SafeAreaView style={styles.message} accessibilityLiveRegion="polite">
          <Image source={require('./assets/icon.png')} style={styles.logo} />
          <Text style={styles.title}>Mossvale</Text>
          {requiredUpdate ? <ScrollView style={styles.updateScroll} contentContainerStyle={styles.updateContent}>
            <Text accessibilityRole="header" style={styles.detail}>Update required</Text>
            <Text style={styles.detail}>Install Mossvale {requiredUpdate.minVersion}{requiredUpdate.minBuild ? ` (build ${requiredUpdate.minBuild})` : ''} or later from {requiredUpdate.platform === 'apple' ? 'the App Store' : 'Google Play'} to continue.</Text>
            <Text style={styles.detail}>Installed: {nativeApplicationVersion || 'unknown'}{nativeBuildVersion ? ` (build ${nativeBuildVersion})` : ''}. Using TestFlight or a testing track? Update through that same channel.</Text>
            {error && <Text style={styles.detail}>The update check could not finish. Check your connection and try again.</Text>}
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { void Linking.openURL(APP_STORE_URLS[requiredUpdate.platform]).catch(() => Alert.alert('Could not open store', 'Open your app store and search for Mossvale, then return to check again.')); }}>
              <Text style={styles.retryText}>Update app</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={loading} style={styles.retry} onPress={() => setAttempt(value => value + 1)}>
              <Text style={styles.retryText}>{loading ? 'Checking…' : 'Check again'}</Text>
            </Pressable>
          </ScrollView> : error ? <>
            <Text style={styles.detail}>{error}</Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => setAttempt(value => value + 1)}>
              <Text style={styles.retryText}>Reconnect</Text>
            </Pressable>
          </> : walletPending || treasurePending ? <>
            <Text style={styles.detail}>{treasurePending ? treasurePending === 'claim' ? 'Approve collecting your MOSS in the wallet, then return to Mossvale. Your wallet request may still be open. Check payout before collecting again.' : 'Approve your voucher wallet connection, then return to Mossvale.' : 'Finish signing in with your wallet, then return to Mossvale.'}</Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => walletAbort.current?.abort()}>
              <Text style={styles.retryText}>{treasurePending === 'claim' ? 'Stop waiting' : treasurePending ? 'Cancel action' : 'Cancel sign-in'}</Text>
            </Pressable>
          </> : <>
            <ActivityIndicator size="large" color="#c8ad73" />
            <Text style={styles.detail}>Opening the lantern roads…</Text>
          </>}
        </SafeAreaView>}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#091310' },
  webview: { flex: 1, backgroundColor: '#091310' },
  message: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091310', padding: 24, gap: 18 },
  logo: { width: 80, height: 80, borderRadius: 18 },
  title: { color: '#ead9b2', fontSize: 32, fontWeight: '700' },
  detail: { color: '#c3cec3', fontSize: 16, lineHeight: 23, maxWidth: 400, textAlign: 'center' },
  updateScroll: { flex: 1, width: '100%' },
  updateContent: { alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: 14, paddingVertical: 8 },
  walletPicker: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091310', padding: 16, gap: 12 },
  walletOptions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 500, gap: 8 },
  walletOption: { width: '47%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  retry: { backgroundColor: '#c8ad73', borderRadius: 12, paddingHorizontal: 30, paddingVertical: 14, minHeight: 48 },
  retryText: { color: '#091310', fontSize: 17, fontWeight: '700' },
});
