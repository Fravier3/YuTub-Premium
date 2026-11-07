package app.yutupremium.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Yutu Premium para Android TV: una WebView a pantalla completa que carga la app web.
 * La app web se actualiza sola (no hace falta un APK nuevo para cada cambio de interfaz).
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "https://fravier3.github.io/YuTub-Premium/";
    private static final String HOST = "fravier3.github.io";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";
    private static final int SEEK_SECONDS = 10;

    private FrameLayout root;
    private WebView web;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean showingOffline = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0F0F0F"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F0F0F"));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // La app web usa este sufijo para activar el modo TV (anillo de foco grande, etc.)
        s.setUserAgentString(s.getUserAgentString() + " YutuTV/1.0");

        web.addJavascriptInterface(new Bridge(), "YutuTV");
        web.setWebViewClient(new TvWebViewClient());
        web.setWebChromeClient(new TvChromeClient());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            load();
        }
        web.requestFocus();
    }

    private void load() {
        showingOffline = false;
        if (isOnline()) {
            web.loadUrl(HOME_URL);
        } else {
            showingOffline = true;
            web.loadUrl(OFFLINE_URL);
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return true; // si no se puede saber, intentar igual
        NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    /** Puente que usa la página sin conexión. */
    private class Bridge {
        @JavascriptInterface
        public void retry() {
            runOnUiThread(MainActivity.this::load);
        }
    }

    private class TvWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String host = request.getUrl().getHost();
            // Dentro de la app solo se navega por el propio sitio; no hay navegador externo en la TV
            return host == null || !host.equals(HOST);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !showingOffline) {
                showingOffline = true;
                view.loadUrl(OFFLINE_URL);
            }
        }
    }

    private class TvChromeClient extends WebChromeClient {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            web.setVisibility(View.GONE);
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            enterImmersive();
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            root.removeView(customView);
            customView = null;
            web.setVisibility(View.VISIBLE);
            web.requestFocus();
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void enterImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /** Teclas multimedia del control remoto: reproducir/pausar y saltar ±10 s. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && !showingOffline) {
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    runVideo("v.paused ? v.play() : v.pause()");
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                    runVideo("v.play()");
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                    runVideo("v.pause()");
                    return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                    runVideo("v.currentTime = Math.min(v.duration || Infinity, v.currentTime + " + SEEK_SECONDS + ")");
                    return true;
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                    runVideo("v.currentTime = Math.max(0, v.currentTime - " + SEEK_SECONDS + ")");
                    return true;
                default:
                    break;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void runVideo(String action) {
        web.evaluateJavascript("(function(){var v=document.querySelector('video');if(v){" + action + ";}})();", null);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            web.getWebChromeClient().onHideCustomView();
        } else if (!showingOffline && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        // Al salir de la app (botón Inicio) el video se pausa
        if (!showingOffline) runVideo("v.pause()");
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        root.removeAllViews();
        web.destroy();
        super.onDestroy();
    }
}
