package app.yutupremium.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.speech.RecognizerIntent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
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

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
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

        web.addJavascriptInterface(new Bridge(), "YutuTV");
        web.setWebViewClient(new TvWebViewClient());
        web.setWebChromeClient(new TvChromeClient());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME_URL);
        }
        web.requestFocus();

        if (savedInstanceState == null) showSplash();
    }

    /**
     * Pantalla de inicio como la de YouTube: fondo negro, una línea roja con un triángulo que avanza y luego
     * el logo con "Yutu Premium TV" debajo. Dura unos segundos y se va cuando la app ya tiene contenido.
     */
    private void showSplash() {
        final float d = getResources().getDisplayMetrics().density;
        final int screenWidth = getResources().getDisplayMetrics().widthPixels;
        splashStartedAt = SystemClock.uptimeMillis();

        splash = new FrameLayout(this);
        splash.setBackgroundColor(Color.BLACK);
        splash.setClickable(true);

        // Logo + texto (aparecen al final de la animación)
        final LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.VERTICAL);
        brand.setGravity(Gravity.CENTER_HORIZONTAL);
        brand.setAlpha(0f);
        final ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        logo.setAdjustViewBounds(true);
        brand.addView(logo, new LinearLayout.LayoutParams((int) (240 * d), ViewGroup.LayoutParams.WRAP_CONTENT));
        final TextView label = new TextView(this);
        label.setText("Yutu Premium TV");
        label.setTextColor(Color.WHITE);
        label.setTextSize(30);
        label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        label.setLetterSpacing(0.06f);
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        labelParams.topMargin = (int) (26 * d);
        brand.addView(label, labelParams);
        splash.addView(brand, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // Línea roja que va detrás de un triángulo: la línea se llena según avanza el triángulo
        final int lineWidth = (int) (screenWidth * 0.42f);
        final View line = new View(this);
        line.setBackgroundColor(Color.parseColor("#F20000"));
        line.setPivotX(0f);
        line.setScaleX(0f);
        splash.addView(line, new FrameLayout.LayoutParams(lineWidth, (int) (4 * d), Gravity.CENTER));
        // El triángulo se agrega después de la línea para dibujarse encima y tapar su extremo
        final TriangleView arrow = new TriangleView(this);
        arrow.setAlpha(0f);
        splash.addView(arrow, new FrameLayout.LayoutParams((int) (22 * d), (int) (26 * d), Gravity.CENTER));

        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Un solo avance mueve las dos cosas: la punta del triángulo siempre queda justo en el borde de la línea
        final ValueAnimator draw = ValueAnimator.ofFloat(0f, 1f);
        draw.setDuration(1100);
        draw.setInterpolator(new AccelerateDecelerateInterpolator());
        draw.addUpdateListener(animation -> {
            float f = (float) animation.getAnimatedValue();
            float edge = -lineWidth / 2f + f * lineWidth;
            line.setScaleX(f);
            arrow.setTranslationX(edge - arrow.getWidth() / 2f);
            arrow.setAlpha(Math.min(1f, f * 8f));
        });
        draw.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                line.animate().alpha(0f).setDuration(300).start();
                arrow.animate().alpha(0f).setDuration(300).start();
                brand.setScaleX(0.92f);
                brand.setScaleY(0.92f);
                brand.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(600).start();
            }
        });
        // Se arranca cuando las vistas ya tienen tamaño (el ancho del triángulo se usa en cada paso)
        splash.post(draw::start);

        handler.postDelayed(this::tryFinishSplash, SPLASH_MIN_MS);
        handler.postDelayed(this::finishSplash, SPLASH_MAX_MS);
    }

    /** Triángulo blanco "play" dibujado a mano (sin depender de la fuente del sistema, que a veces lo pinta como emoji). */
    private static class TriangleView extends View {
        private final android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final android.graphics.Path path = new android.graphics.Path();

        TriangleView(Context context) {
            super(context);
            paint.setColor(Color.WHITE);
        }

        @Override
        protected void onDraw(android.graphics.Canvas canvas) {
            path.reset();
            path.moveTo(0f, 0f);
            path.lineTo(getWidth(), getHeight() / 2f);
            path.lineTo(0f, getHeight());
            path.close();
            canvas.drawPath(path, paint);
        }
    }

    /** Quita la pantalla de inicio cuando pasó el tiempo mínimo y la app ya tiene contenido. */
    private void tryFinishSplash() {
        if (splash == null) return;
        long elapsed = SystemClock.uptimeMillis() - splashStartedAt;
        if (appReady && elapsed >= SPLASH_MIN_MS) {
            finishSplash();
        } else if (elapsed < SPLASH_MAX_MS) {
            handler.postDelayed(this::tryFinishSplash, 200);
        }
    }

    private void finishSplash() {
        final FrameLayout view = splash;
        if (view == null) return;
        splash = null;
        view.animate().alpha(0f).setDuration(400).withEndAction(() -> {
            root.removeView(view);
            web.requestFocus();
            // El WebView puede mover el foco al recuperarlo: se vuelve a poner en Inicio
            web.evaluateJavascript("window.yutuTvFocusStart && window.yutuTvFocusStart()", null);
        }).start();
    }

    /**
     * WebView sin teclado de Android: la búsqueda usa el teclado propio de la app (con sugerencias),
     * así el teclado del sistema no se abre ni tapa nada. Un teclado físico sigue funcionando.
     */
    private static class TvWebView extends WebView {
        TvWebView(Context context) {
            super(context);
        }

        @Override
        public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
            return null;
        }

        @Override
        public boolean onCheckIsTextEditor() {
            return false;
        }
    }

    // ---- Búsqueda por voz ----

    private static final int REQUEST_VOICE = 4711;

    /** La app web avisa cuando el foco está en la barra de búsqueda (caja o lupa). */
    private volatile boolean searchFocused = false;

    // ---- Pantalla de inicio (logo sobre fondo negro, como YouTube) ----
    private static final long SPLASH_MIN_MS = 3200;
    private static final long SPLASH_MAX_MS = 9000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout splash;
    private long splashStartedAt;
    private volatile boolean appReady = false;

    private Intent voiceIntent() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Di lo que quieres buscar");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        return intent;
    }

    /** Puente para que la app web use la búsqueda por voz del sistema. */
    private class Bridge {
        /** La app avisa cuando ya mostró contenido: la pantalla de inicio puede irse. */
        @JavascriptInterface
        public void appReady() {
            appReady = true;
        }

        @JavascriptInterface
        public void setSearchFocused(boolean focused) {
            searchFocused = focused;
        }

        @JavascriptInterface
        public boolean hasVoiceSearch() {
            return voiceIntent().resolveActivity(getPackageManager()) != null;
        }

        @JavascriptInterface
        public void startVoiceSearch() {
            runOnUiThread(() -> {
                try {
                    startActivityForResult(voiceIntent(), REQUEST_VOICE);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "La búsqueda por voz no está disponible en esta TV", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_VOICE || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (results == null || results.isEmpty()) return;
        web.evaluateJavascript("window.yutuTvVoiceResult && window.yutuTvVoiceResult(" + JSONObject.quote(results.get(0)) + ")", null);
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
        if (splash != null) return true; // durante la pantalla de inicio las teclas no hacen nada
        // OK sobre la barra de búsqueda: abrir el teclado propio. Se hace aquí porque, en un campo de texto,
        // Android no siempre entrega el OK a la página.
        if (searchFocused && customView == null && isSelectKey(event.getKeyCode())) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                web.evaluateJavascript("window.yutuTvOpenSearch && window.yutuTvOpenSearch()", null);
            }
            return true;
        }
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
        // Tecla MENÚ del control: ajustes del reproductor (calidad, velocidad, subtítulos)
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getKeyCode() == KeyEvent.KEYCODE_MENU) {
            web.evaluateJavascript("(function(){return !!(window.yutuTvOpenSettings && window.yutuTvOpenSettings());})()", null);
            return true;
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

    private static boolean isSelectKey(int code) {
        return code == KeyEvent.KEYCODE_DPAD_CENTER
                || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    private void runVideo(String action) {
        web.evaluateJavascript("(function(){var v=document.querySelector('video');if(v){" + action + ";}})();", null);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            web.getWebChromeClient().onHideCustomView();
            return;
        }
        // Primero que la página cierre lo que esté abierto (menú de calidad, controles); si no, retroceder
        web.evaluateJavascript("(function(){return !!(window.yutuTvBack && window.yutuTvBack());})()", value -> {
            if ("true".equals(value)) return;
            if (web.canGoBack()) {
                web.goBack();
            } else {
                finish();
            }
        });
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
        searchFocused = false;
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
