package app.yutupremium.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Yutu Premium para Android TV: una WebView a pantalla completa que carga la app web.
 * La app web se actualiza sola (no hace falta un APK nuevo para cada cambio de interfaz).
 */
public class MainActivity extends Activity {

    /** La app va dentro del APK (assets/www) y se sirve bajo este origen https local: no depende de ninguna web. */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME_URL = "https://" + HOST + "/index.html";
    private static final int SEEK_SECONDS = 10;

    private FrameLayout root;
    private WebView web;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0F0F0F"));

        web = new TvWebView(this);
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

        web.setWebViewClient(new TvWebViewClient());
        web.setWebChromeClient(new TvChromeClient());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME_URL);
        }
        web.requestFocus();
    }

    /**
     * WebView que atrapa el Enter / "Buscar" del teclado de pantalla. Sin esto, el teclado de Android TV
     * manda la tecla como acción del sistema y la página no hace la búsqueda ni oculta el teclado.
     */
    private class TvWebView extends WebView {
        TvWebView(Context context) {
            super(context);
        }

        @Override
        public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
            InputConnection base = super.onCreateInputConnection(outAttrs);
            if (base == null) return null;
            return new InputConnectionWrapper(base, true) {
                @Override
                public boolean performEditorAction(int actionCode) {
                    submitTextField();
                    return true;
                }

                @Override
                public boolean sendKeyEvent(KeyEvent event) {
                    int code = event.getKeyCode();
                    if (code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                        if (event.getAction() == KeyEvent.ACTION_UP) submitTextField();
                        return true;
                    }
                    return super.sendKeyEvent(event);
                }
            };
        }
    }

    /** Envía el campo enfocado (busca) y oculta el teclado de pantalla. */
    private void submitTextField() {
        web.post(() -> {
            web.evaluateJavascript("(function(){return !!(window.yutuTvSubmitInput && window.yutuTvSubmitInput());})()", null);
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
            web.requestFocus();
        });
    }

    private class TvWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String host = request.getUrl().getHost();
            // Dentro de la app solo se navega por los archivos propios; no hay navegador externo en la TV
            return host == null || !host.equals(HOST);
        }

        /** Sirve los archivos de la app desde los assets del APK. */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!HOST.equals(uri.getHost())) return null; // API de videos, miniaturas, etc.: red normal

            String path = uri.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            try {
                InputStream in = getAssets().open("www" + path);
                WebResourceResponse response = new WebResourceResponse(mimeFor(path), "UTF-8", in);
                response.setResponseHeaders(new HashMap<String, String>());
                return response;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                        new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
            }
        }
    }

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("txt", "text/plain");
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        String mime = MIME.get(ext);
        return mime != null ? mime : "application/octet-stream";
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
        // Video a pantalla completa: la página no recibe las teclas, así que OK pausa y ←/→ saltan
        if (customView != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    runVideo("v.paused ? v.play() : v.pause()");
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    runVideo("v.currentTime = Math.min(v.duration || Infinity, v.currentTime + " + SEEK_SECONDS + ")");
                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    runVideo("v.currentTime = Math.max(0, v.currentTime - " + SEEK_SECONDS + ")");
                    return true;
                default:
                    break;
            }
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
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
        } else if (web.canGoBack()) {
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
        runVideo("v.pause()");
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
