package com.wifi.videocall;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

/**
 * WiFi 영상통화 - 얇은 WebView 래퍼.
 *
 * 이 앱은 사용자가 입력한 서버 주소(예: https://192.168.0.10:8443)를 WebView로 띄운다.
 * 서버가 서빙하는 WebRTC 화면을 그대로 사용하므로, 폰(APK)과 다른 기기(브라우저)가
 * 같은 서버에 붙어 P2P 영상통화를 한다.
 *
 * WebView 에서 카메라/마이크가 동작하도록:
 *  - 앱 런타임 권한(CAMERA, RECORD_AUDIO)을 요청한다.
 *  - WebChromeClient.onPermissionRequest 로 웹 페이지의 미디어 요청을 승인한다.
 *  - 자체 서명 인증서(HTTPS)를 허용하기 위해 onReceivedSslError 에서 진행한다.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "videocall";
    private static final String KEY_URL = "server_url";
    private static final int REQ_PERMS = 100;

    // 기본 접속 주소: 별도 서버 없이 바로 통화되는 GitHub Pages(PeerJS) 앱.
    // 자체 서버를 쓰려면 상단 주소창에 그 주소를 입력하면 된다.
    private static final String DEFAULT_URL = "https://vlralf77-svg.github.io/rep/";

    private WebView webView;
    private EditText urlInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        urlInput = findViewById(R.id.urlInput);
        Button goBtn = findViewById(R.id.goBtn);

        setupWebView();

        // 마지막으로 접속한 주소 복원 (없으면 기본 Pages 주소)
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_URL, DEFAULT_URL);
        urlInput.setText(saved);

        goBtn.setOnClickListener(v -> connect());
        urlInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                connect();
                return true;
            }
            return false;
        });

        // 카메라/마이크 권한 확보
        requestMediaPermissions();

        // 저장된(또는 기본) 주소를 바로 로드
        webView.loadUrl(saved);
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // 자동 재생 허용
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebChromeClient(new WebChromeClient() {
            // 웹 페이지의 카메라/마이크 요청 승인
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            // 자체 서명 인증서 허용 (LAN 내 개인 서버용).
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }
        });
    }

    private void connect() {
        String url = urlInput.getText().toString().trim();
        if (TextUtils.isEmpty(url)) {
            Toast.makeText(this, "서버 주소를 입력하세요", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_URL, url).apply();
        webView.loadUrl(url);
    }

    private void requestMediaPermissions() {
        String[] perms = {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO};
        boolean need = false;
        for (String p : perms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                need = true;
                break;
            }
        }
        if (need) {
            requestPermissions(perms, REQ_PERMS);
        }
    }

    // 뒤로가기: 웹 히스토리가 있으면 뒤로, 없으면 앱 종료
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
