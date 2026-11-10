package com.powderline.hokkaido;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ViewTreeLifecycleOwner;
import androidx.lifecycle.ViewTreeViewModelStoreOwner;
import androidx.lifecycle.ViewModelStoreOwner;
import androidx.savedstate.SavedStateRegistryOwner;
import androidx.savedstate.ViewTreeSavedStateRegistryOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.mapbox.bindgen.Expected;
import com.mapbox.bindgen.Value;
import com.mapbox.common.Cancelable;
import com.mapbox.common.MapboxOptions;
import com.mapbox.common.OfflineSwitch;
import com.mapbox.common.TileRegion;
import com.mapbox.common.TileRegionError;
import com.mapbox.common.TileRegionLoadOptions;
import com.mapbox.common.TileStore;
import com.mapbox.common.TilesetDescriptor;
import com.mapbox.geojson.Point;
import com.mapbox.geojson.Polygon;
import com.mapbox.maps.CameraOptions;
import com.mapbox.maps.GlyphsRasterizationMode;
import com.mapbox.maps.LayerPosition;
import com.mapbox.maps.MapInitOptions;
import com.mapbox.maps.MapView;
import com.mapbox.maps.MapboxMap;
import com.mapbox.maps.OfflineManager;
import com.mapbox.maps.Style;
import com.mapbox.maps.StylePack;
import com.mapbox.maps.StylePackError;
import com.mapbox.maps.StylePackLoadOptions;
import com.mapbox.maps.TilesetDescriptorOptions;
import com.mapbox.maps.plugin.locationcomponent.LocationComponentPlugin;
import com.mapbox.maps.plugin.locationcomponent.LocationComponentUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "OfflineMapTest",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class OfflineMapTestPlugin extends Plugin {

    private static final String TAG = "PowderlineOfflineMap";
    private static final String PREFS_NAME = "PowderlineOfflineTestPrefs";
    private static final String PREF_MAPBOX_TOKEN = "mapbox_public_token";
    private static final String PREF_DONGTAN_BBOX = "dongtan_bbox_json";
    private static final String PREF_DONGTAN_SOURCE = "dongtan_bbox_source";

    private static final String DEFAULT_SUPABASE_URL = "https://lxfsvhwibiaspnaduhri.supabase.co";
    private static final String DEFAULT_SUPABASE_KEY = "sb_publishable_1ephBEp88K0I6OK0HoPMXw_QOvHklEY";

    private static final String STYLE_STANDARD_SATELLITE = Style.STANDARD_SATELLITE;
    private static final String DEM_TILESET_URI = "mapbox://mapbox.mapbox-terrain-dem-v1";
    private static final String DONGTAN_TILE_REGION_ID = "dongtan-offline-test-v1";
    private static final String TILE_REGION_ID_PREFIX = "powderline-offline-v1-";
    private static final double MAX_REGION_LONGITUDE_SPAN = 0.5;
    private static final double MAX_REGION_LATITUDE_SPAN = 0.5;
    private static final double MAX_REGION_BBOX_AREA = 0.05;

    // Explicit test BBox for Dongtan [minLng, minLat, maxLng, maxLat]
    private static final double[] EXPLICIT_DONGTAN_BBOX = new double[]{
        127.0837, 37.1676, 127.0945, 37.1822
    };
    private static final double[] EXPLICIT_DONGTAN_CENTER = new double[]{
        127.0891, 37.1749
    };
    private static final double DEFAULT_ZOOM = 14.5;
    private static final double DEFAULT_PITCH = 56.0;
    private static final double DEFAULT_BEARING = 24.0;
    private static final byte SAT_MIN_ZOOM = 10;
    private static final byte SAT_MAX_ZOOM = 16;
    private static final byte DEM_MIN_ZOOM = 10;
    private static final byte DEM_MAX_ZOOM = 14;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    private Button floatingEntryBtn;
    private Dialog testDialog;
    private MapView mapView;
    private TextView bboxInfoView;
    private TextView statusTextView;
    private Button offlineSwitchBtn;

    private OfflineManager offlineManager;
    private TileStore tileStore;
    private Cancelable activeStyleCancelable;
    private Cancelable activeTileCancelable;
    private volatile long downloadGeneration = 0L;

    private boolean mapboxOfflineForced = false;
    private String activeRegionId = "dongtan";
    private String activeRegionName = "동탄";
    private String activeTileRegionId = DONGTAN_TILE_REGION_ID;
    private double[] activeBbox = EXPLICIT_DONGTAN_BBOX.clone();
    private double[] activeCenter = EXPLICIT_DONGTAN_CENTER.clone();
    private String activeBboxSource = "명시적 시험용 BBox (기본값)";

    private LocationManager locationManager;
    private LocationListener locationListener;
    private Location lastKnownGpsFix;

    @Override
    public void load() {
        super.load();
        loadCachedMetadata();
        mainHandler.postDelayed(this::attachFloatingTestEntryButton, 900);
    }

    private void loadCachedMetadata() {
        Activity activity = getActivity();
        if (activity == null) return;
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String bboxRaw = prefs.getString(PREF_DONGTAN_BBOX, null);
        String sourceRaw = prefs.getString(PREF_DONGTAN_SOURCE, null);
        if (!TextUtils.isEmpty(bboxRaw)) {
            try {
                JSONArray arr = new JSONArray(bboxRaw);
                if (arr.length() == 4) {
                    activeBbox = new double[]{
                        arr.getDouble(0), arr.getDouble(1), arr.getDouble(2), arr.getDouble(3)
                    };
                    activeCenter = new double[]{
                        (activeBbox[0] + activeBbox[2]) / 2.0,
                        (activeBbox[1] + activeBbox[3]) / 2.0
                    };
                    if (!TextUtils.isEmpty(sourceRaw)) {
                        activeBboxSource = sourceRaw;
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    private void activateDongtanRegion() {
        activeRegionId = "dongtan";
        activeRegionName = "동탄";
        activeTileRegionId = DONGTAN_TILE_REGION_ID;
        activeBbox = EXPLICIT_DONGTAN_BBOX.clone();
        activeCenter = EXPLICIT_DONGTAN_CENTER.clone();
        activeBboxSource = "명시적 시험용 BBox (기본값)";
        loadCachedMetadata();
    }

    private void configureActiveRegion(PluginCall call) {
        JSONObject data = call.getData();
        String regionId = data.optString("regionId", "").trim().toLowerCase(Locale.ROOT);
        String regionName = data.optString("regionName", "").trim();
        JSONArray center = data.optJSONArray("center");
        JSONArray bounds = data.optJSONArray("bounds");
        if (bounds == null) bounds = data.optJSONArray("bbox");

        if (!regionId.matches("[a-z0-9][a-z0-9._-]{0,63}")) {
            throw new IllegalArgumentException("regionId는 영문 소문자·숫자·점·밑줄·하이픈으로 입력하세요.");
        }
        if (TextUtils.isEmpty(regionName) || regionName.length() > 80) {
            throw new IllegalArgumentException("regionName은 1~80자로 입력하세요.");
        }
        if (center == null || center.length() != 2 || bounds == null || bounds.length() != 4) {
            throw new IllegalArgumentException("center는 [lng,lat], bounds는 [minLng,minLat,maxLng,maxLat] 형식이어야 합니다.");
        }

        try {
            double centerLng = center.getDouble(0);
            double centerLat = center.getDouble(1);
            double minLng = bounds.getDouble(0);
            double minLat = bounds.getDouble(1);
            double maxLng = bounds.getDouble(2);
            double maxLat = bounds.getDouble(3);
            boolean finite = Double.isFinite(centerLng) && Double.isFinite(centerLat)
                && Double.isFinite(minLng) && Double.isFinite(minLat)
                && Double.isFinite(maxLng) && Double.isFinite(maxLat);
            boolean validWorldBounds = minLng >= -180.0 && maxLng <= 180.0
                && minLat >= -85.0 && maxLat <= 85.0;
            boolean ordered = maxLng > minLng && maxLat > minLat;
            boolean boundedSize = maxLng - minLng <= MAX_REGION_LONGITUDE_SPAN
                && maxLat - minLat <= MAX_REGION_LATITUDE_SPAN
                && (maxLng - minLng) * (maxLat - minLat) <= MAX_REGION_BBOX_AREA;
            boolean centerInside = centerLng >= minLng && centerLng <= maxLng
                && centerLat >= minLat && centerLat <= maxLat;
            if (!finite || !validWorldBounds || !ordered || !boundedSize || !centerInside) {
                throw new IllegalArgumentException("지역 중심·경계 좌표가 유효하지 않거나 다운로드 허용 범위를 초과했습니다.");
            }

            activeRegionId = regionId;
            activeRegionName = regionName;
            activeTileRegionId = tileRegionIdFor(regionId);
            activeCenter = new double[]{centerLng, centerLat};
            activeBbox = new double[]{minLng, minLat, maxLng, maxLat};
            activeBboxSource = "Capacitor 지역 입력 (" + regionId + ")";
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("지역 좌표를 읽을 수 없습니다.");
        }
    }

    private static String tileRegionIdFor(String regionId) {
        return "dongtan".equals(regionId) ? DONGTAN_TILE_REGION_ID : TILE_REGION_ID_PREFIX + regionId;
    }

    /**
     * Attaches a non-intrusive Native Android test button over the Activity decorView
     * so the existing Home/WebView HTML/JS/CSS remains 100% untouched.
     */
    private void attachFloatingTestEntryButton() {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || floatingEntryBtn != null) return;

        View contentView = activity.findViewById(android.R.id.content);
        if (!(contentView instanceof FrameLayout)) return;
        FrameLayout rootFrame = (FrameLayout) contentView;

        Button btn = new Button(activity);
        btn.setText("오프라인 3D 시험");
        btn.setAllCaps(false);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        int padH = dp(activity, 10);
        int padV = dp(activity, 5);
        btn.setPadding(padH, padV, padH, padV);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#CC0F172A"));
        bg.setCornerRadius(dp(activity, 16));
        bg.setStroke(dp(activity, 1), Color.parseColor("#38BDF8"));
        btn.setBackground(bg);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.END
        );
        lp.topMargin = dp(activity, 88);
        lp.rightMargin = dp(activity, 10);

        btn.setOnClickListener(v -> {
            activateDongtanRegion();
            openTestScreenInternal(null);
        });
        rootFrame.addView(btn, lp);
        floatingEntryBtn = btn;
    }

    @PluginMethod
    public void openTestScreen(PluginCall call) {
        mainHandler.post(() -> {
            activateDongtanRegion();
            openTestScreenInternal(call);
        });
    }

    @PluginMethod
    public void closeTestScreen(PluginCall call) {
        mainHandler.post(() -> {
            dismissTestDialog();
            if (call != null) {
                JSObject ret = new JSObject();
                ret.put("closed", true);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void downloadDongtan(PluginCall call) {
        mainHandler.post(() -> {
            activateDongtanRegion();
            syncTokenAndRegionBeforeOpen(true, () -> {
                if (testDialog == null || !testDialog.isShowing()) {
                    Activity activity = getActivity();
                    if (activity != null && !activity.isFinishing()) showNativeOfflineTestDialog(activity);
                }
                startDongtanDownload(call);
            });
        });
    }

    @PluginMethod
    public void openRegionScreen(PluginCall call) {
        mainHandler.post(() -> {
            try {
                configureActiveRegion(call);
            } catch (IllegalArgumentException error) {
                call.reject(error.getMessage());
                return;
            }
            if (testDialog != null && testDialog.isShowing()) dismissTestDialog();
            syncTokenAndRegionBeforeOpen(false, () -> {
                Activity activity = getActivity();
                if (activity == null || activity.isFinishing()) {
                    call.reject("Activity unavailable");
                    return;
                }
                showNativeOfflineTestDialog(activity);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                ret.put("regionId", activeRegionId);
                ret.put("tileRegionId", activeTileRegionId);
                call.resolve(ret);
            });
        });
    }

    @PluginMethod
    public void downloadRegion(PluginCall call) {
        mainHandler.post(() -> {
            try {
                configureActiveRegion(call);
            } catch (IllegalArgumentException error) {
                call.reject(error.getMessage());
                return;
            }
            syncTokenAndRegionBeforeOpen(false, () -> startRegionDownload(call));
        });
    }

    @PluginMethod
    public void getOfflineStatus(PluginCall call) {
        mainHandler.post(() -> queryOfflineInventory(call));
    }

    private void openTestScreenInternal(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            if (call != null) call.reject("Activity unavailable");
            return;
        }
        if (testDialog != null && testDialog.isShowing()) {
            if (call != null) {
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            }
            return;
        }

        syncTokenAndRegionBeforeOpen(true, () -> {
            showNativeOfflineTestDialog(activity);
            if (call != null) {
                JSObject ret = new JSObject();
                ret.put("opened", true);
                ret.put("bboxSource", activeBboxSource);
                call.resolve(ret);
            }
        });
    }

    /**
     * Reads cached Mapbox token from WebView localStorage or SharedPreferences,
     * and checks DB (powderline_regions) for Dongtan BBox if online.
     */
    private void syncTokenAndRegionBeforeOpen(boolean resolveDongtanRegion, Runnable onReady) {
        Activity activity = getActivity();
        if (activity == null) {
            onReady.run();
            return;
        }
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.evaluateJavascript(
                "(function(){try{return JSON.stringify({" +
                    "token:localStorage.getItem('powderline.mapboxCompareToken')||''," +
                    "url:localStorage.getItem('powderline.supabaseUrl')||'https://lxfsvhwibiaspnaduhri.supabase.co'," +
                    "key:localStorage.getItem('powderline.supabasePublishableKey')||'sb_publishable_1ephBEp88K0I6OK0HoPMXw_QOvHklEY'" +
                    "});}catch(e){return '{}';}})()",
                value -> ioExecutor.execute(() -> {
                    String token = "";
                    String supabaseUrl = DEFAULT_SUPABASE_URL;
                    String supabaseKey = DEFAULT_SUPABASE_KEY;
                    try {
                        String raw = value;
                        if (raw != null && raw.startsWith("\"") && raw.endsWith("\"")) {
                            raw = raw.substring(1, raw.length() - 1).replace("\\\"", "\"");
                        }
                        JSONObject obj = new JSONObject(raw != null ? raw : "{}");
                        token = obj.optString("token", "").trim();
                        supabaseUrl = obj.optString("url", DEFAULT_SUPABASE_URL).trim();
                        supabaseKey = obj.optString("key", DEFAULT_SUPABASE_KEY).trim();
                    } catch (Exception ignored) {
                    }
                    resolveTokenAndDongtanBbox(activity, token, supabaseUrl, supabaseKey, resolveDongtanRegion);
                    mainHandler.post(onReady);
                })
            );
        } else {
            ioExecutor.execute(() -> {
                resolveTokenAndDongtanBbox(activity, "", DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY, resolveDongtanRegion);
                mainHandler.post(onReady);
            });
        }
    }

    private void resolveTokenAndDongtanBbox(
        Activity activity,
        String webToken,
        String supabaseUrl,
        String supabaseKey,
        boolean resolveDongtanRegion
    ) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String token = webToken;
        if (token.startsWith("pk.")) {
            prefs.edit().putString(PREF_MAPBOX_TOKEN, token).apply();
        } else {
            token = prefs.getString(PREF_MAPBOX_TOKEN, "");
        }

        if (!token.startsWith("pk.")) {
            String fetched = fetchMapboxPublicTokenFromEdge(supabaseUrl, supabaseKey);
            if (fetched.startsWith("pk.")) {
                token = fetched;
                prefs.edit().putString(PREF_MAPBOX_TOKEN, token).apply();
            }
        }

        if (token.startsWith("pk.")) {
            MapboxOptions.setAccessToken(token);
        }

        // Requirement 7: Check DB (powderline_regions) for Dongtan BBox; fallback to explicit test BBox
        if (!resolveDongtanRegion) return;
        boolean loadedFromDb = tryLoadDongtanBboxFromSupabase(prefs, supabaseUrl, supabaseKey);
        if (!loadedFromDb) {
            String cachedSource = prefs.getString(PREF_DONGTAN_SOURCE, "");
            if (TextUtils.isEmpty(cachedSource)) {
                activeBbox = EXPLICIT_DONGTAN_BBOX.clone();
                activeCenter = EXPLICIT_DONGTAN_CENTER.clone();
                activeBboxSource = "명시적 시험용 BBox (DB 동탄 미등록/오프라인 폴백)";
            }
        }
    }

    private String fetchMapboxPublicTokenFromEdge(String supabaseUrl, String supabaseKey) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(supabaseUrl + "/functions/v1/mapbox-public-token");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(3500);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("apikey", supabaseKey);
            if (conn.getResponseCode() == 200) {
                String body = readStream(conn.getInputStream());
                JSONObject json = new JSONObject(body);
                return json.optString("token", "").trim();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return "";
    }

    private boolean tryLoadDongtanBboxFromSupabase(
        SharedPreferences prefs,
        String supabaseUrl,
        String supabaseKey
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(
                supabaseUrl + "/rest/v1/powderline_regions?select=id,label,center_lng,center_lat,bbox"
            );
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("apikey", supabaseKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseKey);
            if (conn.getResponseCode() != 200) return false;

            String body = readStream(conn.getInputStream());
            JSONArray rows = new JSONArray(body);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String id = row.optString("id", "").toLowerCase(Locale.ROOT);
                String label = row.optString("label", "");
                if ("dongtan".equals(id) || id.contains("dongtan") || label.contains("동탄")) {
                    JSONArray bboxArr = row.optJSONArray("bbox");
                    if (bboxArr != null && bboxArr.length() == 4) {
                        double minLng = bboxArr.getDouble(0);
                        double minLat = bboxArr.getDouble(1);
                        double maxLng = bboxArr.getDouble(2);
                        double maxLat = bboxArr.getDouble(3);
                        if (Double.isFinite(minLng) && Double.isFinite(minLat)
                            && Double.isFinite(maxLng) && Double.isFinite(maxLat)
                            && maxLng > minLng && maxLat > minLat) {
                            activeBbox = new double[]{minLng, minLat, maxLng, maxLat};
                            double cLng = row.optDouble("center_lng", (minLng + maxLng) / 2.0);
                            double cLat = row.optDouble("center_lat", (minLat + maxLat) / 2.0);
                            activeCenter = new double[]{cLng, cLat};
                            activeBboxSource = "Supabase DB (powderline_regions: " + row.optString("id") + ")";
                            prefs.edit()
                                .putString(PREF_DONGTAN_BBOX, bboxArr.toString())
                                .putString(PREF_DONGTAN_SOURCE, activeBboxSource)
                                .apply();
                            return true;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return false;
    }

    private void showNativeOfflineTestDialog(Activity activity) {
        Dialog dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setCancelable(true);
        dialog.setOnDismissListener(d -> cleanupDialogResources());

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0B1120"));

        // 1. Header Bar
        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(Color.parseColor("#111827"));
        header.setPadding(dp(activity, 12), dp(activity, 10), dp(activity, 12), dp(activity, 10));

        TextView titleView = new TextView(activity);
        titleView.setText("Mapbox Native 오프라인 3D 시험 (" + activeRegionName + ")");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        );
        header.addView(titleView, titleLp);

        Button closeBtn = createActionButton(activity, "닫기", "#374151");
        closeBtn.setOnClickListener(v -> dismissTestDialog());
        header.addView(closeBtn);
        root.addView(header, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // 2. BBox & Status Info Panel
        LinearLayout infoBox = new LinearLayout(activity);
        infoBox.setOrientation(LinearLayout.VERTICAL);
        infoBox.setBackgroundColor(Color.parseColor("#1E293B"));
        infoBox.setPadding(dp(activity, 12), dp(activity, 8), dp(activity, 12), dp(activity, 8));

        bboxInfoView = new TextView(activity);
        bboxInfoView.setTextColor(Color.parseColor("#93C5FD"));
        bboxInfoView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        updateBboxSummaryText();
        infoBox.addView(bboxInfoView);

        statusTextView = new TextView(activity);
        statusTextView.setTextColor(Color.parseColor("#E2E8F0"));
        statusTextView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        statusTextView.setPadding(0, dp(activity, 4), 0, 0);
        String currentToken = MapboxOptions.getAccessToken();
        if (TextUtils.isEmpty(currentToken) || !currentToken.startsWith("pk.")) {
            statusTextView.setText("상태: Mapbox 공개 토큰(pk.)을 찾지 못했습니다. 온라인 상태에서 한 번 실행해 토큰을 캐시하세요.");
        } else {
            statusTextView.setText("상태: 준비됨 — [" + activeRegionName + " 다운로드] 후 비행기 모드에서 3D 지형·GPS를 확인하세요.");
        }
        infoBox.addView(statusTextView);
        root.addView(infoBox, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // 3. Action Buttons Toolbar (Horizontally Scrollable)
        HorizontalScrollView scrollBar = new HorizontalScrollView(activity);
        scrollBar.setFillViewport(false);
        scrollBar.setBackgroundColor(Color.parseColor("#0F172A"));
        LinearLayout btnRow = new LinearLayout(activity);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setPadding(dp(activity, 8), dp(activity, 6), dp(activity, 8), dp(activity, 6));

        Button downloadBtn = createActionButton(activity, activeRegionName + " 다운로드", "#0284C7");
        downloadBtn.setOnClickListener(v -> startRegionDownload(null));
        btnRow.addView(downloadBtn);

        Button checkStatusBtn = createActionButton(activity, "저장 상태 확인", "#334155");
        checkStatusBtn.setOnClickListener(v -> queryOfflineInventory(null));
        btnRow.addView(checkStatusBtn);

        offlineSwitchBtn = createActionButton(activity, "Mapbox망: 온라인", "#059669");
        offlineSwitchBtn.setOnClickListener(v -> toggleMapboxOfflineSwitch());
        btnRow.addView(offlineSwitchBtn);

        Button gpsBtn = createActionButton(activity, "내 위치(GPS)", "#2563EB");
        gpsBtn.setOnClickListener(v -> enableAndCenterGps());
        btnRow.addView(gpsBtn);

        Button dongtanCamBtn = createActionButton(activity, activeRegionName + " 3D 시점", "#4F46E5");
        dongtanCamBtn.setOnClickListener(v -> moveCameraToActiveRegion3D());
        btnRow.addView(dongtanCamBtn);

        if ("dongtan".equals(activeRegionId)) {
            Button clearBtn = createActionButton(activity, "캐시 삭제", "#B91C1C");
            clearBtn.setOnClickListener(v -> clearDongtanOfflineCache());
            btnRow.addView(clearBtn);
        }

        scrollBar.addView(btnRow);
        root.addView(scrollBar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // 4. Mapbox Native MapView Container
        FrameLayout mapContainer = new FrameLayout(activity);
        mapContainer.setBackgroundColor(Color.parseColor("#1E293B"));
        LinearLayout.LayoutParams mapLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        );
        root.addView(mapContainer, mapLp);

        dialog.setContentView(root);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            );
            View decorView = window.getDecorView();
            if (decorView != null) {
                if (activity instanceof LifecycleOwner) {
                    ViewTreeLifecycleOwner.set(decorView, (LifecycleOwner) activity);
                }
                if (activity instanceof ViewModelStoreOwner) {
                    ViewTreeViewModelStoreOwner.set(decorView, (ViewModelStoreOwner) activity);
                }
                if (activity instanceof SavedStateRegistryOwner) {
                    ViewTreeSavedStateRegistryOwner.set(decorView, (SavedStateRegistryOwner) activity);
                }
            }
        }
        dialog.show();
        testDialog = dialog;

        try {
            if (!(activity instanceof LifecycleOwner)) {
                Log.e(TAG, "Host activity does not implement LifecycleOwner: " + activity.getClass().getName());
                updateStatus("오류: 호스트 Activity가 LifecycleOwner를 구현하지 않았습니다: " + activity.getClass().getSimpleName());
                return;
            }
            LifecycleOwner lifecycleOwner = (LifecycleOwner) activity;

            CameraOptions cameraOptions = new CameraOptions.Builder()
                .center(Point.fromLngLat(activeCenter[0], activeCenter[1]))
                .zoom(DEFAULT_ZOOM)
                .pitch(DEFAULT_PITCH)
                .bearing(DEFAULT_BEARING)
                .build();

            // Use 1-arg MapInitOptions(context) so Kotlin @NotNull defaults (mapOptions, plugins) are populated
            MapInitOptions initOptions = new MapInitOptions(activity);
            initOptions.setTextureView(true);
            initOptions.setCameraOptions(cameraOptions);

            mapView = new MapView(activity, initOptions);
            mapView.setVisibility(View.VISIBLE);

            // Bind LifecycleOwner explicitly to MapView and its container before window attachment
            ViewTreeLifecycleOwner.set(mapContainer, lifecycleOwner);
            ViewTreeLifecycleOwner.set(mapView, lifecycleOwner);
            if (activity instanceof ViewModelStoreOwner) {
                ViewTreeViewModelStoreOwner.set(mapContainer, (ViewModelStoreOwner) activity);
                ViewTreeViewModelStoreOwner.set(mapView, (ViewModelStoreOwner) activity);
            }
            if (activity instanceof SavedStateRegistryOwner) {
                ViewTreeSavedStateRegistryOwner.set(mapContainer, (SavedStateRegistryOwner) activity);
                ViewTreeSavedStateRegistryOwner.set(mapView, (SavedStateRegistryOwner) activity);
            }

            mapContainer.addView(mapView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));

            mapView.onStart();
            Log.i(TAG, "MapView created, attached with LifecycleOwner, and onStart() called. Center=" + activeCenter[0] + "," + activeCenter[1]);
            setupMapStyleAnd3DTerrain();
            enableLocationComponentIfPermitted();
            queryOfflineInventory(null);
        } catch (Throwable e) {
            Log.e(TAG, "MapView initialization failed", e);
            updateStatus("MapView 초기화 실패: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }
    }

    private void setupMapStyleAnd3DTerrain() {
        if (mapView == null) {
            Log.e(TAG, "setupMapStyleAnd3DTerrain skipped: mapView is null");
            return;
        }
        try {
            final String styleUri = !TextUtils.isEmpty(STYLE_STANDARD_SATELLITE)
                ? STYLE_STANDARD_SATELLITE
                : "mapbox://styles/mapbox/standard-satellite";
            MapboxMap mapboxMap = mapView.getMapboxMap();
            Log.i(TAG, "Loading style: " + styleUri);
            mapboxMap.loadStyle(styleUri, new Style.OnStyleLoaded() {
                @Override
                public void onStyleLoaded(@NonNull Style style) {
                    Log.i(TAG, "Style loaded successfully: " + styleUri);
                    apply3DTerrainAndOverlay(style);
                }
            });
        } catch (Throwable e) {
            Log.e(TAG, "loadStyle failed", e);
            updateStatus("스타일 로드 오류: " + e.getMessage());
        }
    }

    private void apply3DTerrainAndOverlay(@NonNull Style style) {
        try {
            // 1. Add raster-dem source (mapbox://mapbox.mapbox-terrain-dem-v1) & enable 3D Terrain
            if (!style.styleSourceExists("mapbox-dem")) {
                String demSourceJson = "{"
                    + "\"type\":\"raster-dem\","
                    + "\"url\":\"" + DEM_TILESET_URI + "\","
                    + "\"tileSize\":512,"
                    + "\"maxzoom\":14"
                    + "}";
                Expected<String, Value> demSourceVal = Value.fromJson(demSourceJson);
                if (demSourceVal.isValue() && demSourceVal.getValue() != null) {
                    Expected<String, com.mapbox.bindgen.None> addDemRes =
                        style.addStyleSource("mapbox-dem", demSourceVal.getValue());
                    if (addDemRes.isError()) {
                        Log.w(TAG, "addStyleSource(mapbox-dem) error: " + addDemRes.getError());
                    }
                }
            }
            String terrainJson = "{\"source\":\"mapbox-dem\",\"exaggeration\":1.5}";
            Expected<String, Value> terrainVal = Value.fromJson(terrainJson);
            if (terrainVal.isValue() && terrainVal.getValue() != null) {
                Expected<String, com.mapbox.bindgen.None> terRes =
                    style.setStyleTerrain(terrainVal.getValue());
                if (terRes.isError()) {
                    Log.w(TAG, "setStyleTerrain error: " + terRes.getError());
                } else {
                    Log.i(TAG, "3D Terrain enabled (mapbox-dem, exaggeration=1.5)");
                }
            }
        } catch (Throwable e) {
            Log.e(TAG, "apply3DTerrainAndOverlay error", e);
            updateStatus("3D 지형 설정 경고: " + e.getMessage());
        }
    }

    private void ensureOfflineManagers() {
        if (offlineManager == null) {
            offlineManager = new OfflineManager();
        }
        if (tileStore == null) {
            tileStore = TileStore.create();
        }
    }

    private void startDongtanDownload(PluginCall call) {
        startRegionDownload(call);
    }

    private void startRegionDownload(PluginCall call) {
        try {
            String token = MapboxOptions.getAccessToken();
            if (TextUtils.isEmpty(token) || !token.startsWith("pk.")) {
                String msg = "오류: 유효한 Mapbox 토큰(pk.)이 없습니다. 온라인 상태에서 먼저 토큰을 로드하세요.";
                updateStatus(msg);
                if (call != null) call.reject(msg);
                return;
            }

            if (mapboxOfflineForced) {
                toggleMapboxOfflineSwitch();
            }

            ensureOfflineManagers();
            cancelActiveDownloads();
            final long generation = downloadGeneration;
            final String regionId = activeRegionId;
            final String regionName = activeRegionName;
            final String tileRegionId = activeTileRegionId;
            final double[] regionBbox = activeBbox.clone();

            final String styleUri = !TextUtils.isEmpty(STYLE_STANDARD_SATELLITE)
                ? STYLE_STANDARD_SATELLITE
                : "mapbox://styles/mapbox/standard-satellite";

            updateStatus("1/2 스타일 팩(Standard Satellite) 다운로드 시작...");

            StylePackLoadOptions styleOptions = new StylePackLoadOptions.Builder()
                .glyphsRasterizationMode(GlyphsRasterizationMode.IDEOGRAPHS_RASTERIZED_LOCALLY)
                .acceptExpired(true)
                .build();

            activeStyleCancelable = offlineManager.loadStylePack(
                styleUri,
                styleOptions,
                progress -> {
                    if (generation != downloadGeneration) return;
                    long done = progress.getCompletedResourceCount();
                    long req = Math.max(1, progress.getRequiredResourceCount());
                    int pct = (int) Math.min(100, (done * 100) / req);
                    mainHandler.post(() -> updateStatus(String.format(
                        Locale.KOREA,
                        "1/2 스타일 팩 다운로드 중: %d%% (%d/%d)",
                        pct, done, req
                    )));
                },
                expected -> {
                    if (generation != downloadGeneration) return;
                    if (expected.isError()) {
                        StylePackError err = expected.getError();
                        String errMsg = err != null ? err.getMessage() : "Unknown StylePack error";
                        String msg = "스타일 팩 다운로드 실패: " + errMsg;
                        mainHandler.post(() -> updateStatus(msg));
                        if (call != null) call.reject(msg);
                        return;
                    }
                    mainHandler.post(() -> startTileRegionDownload(
                        call, generation, regionId, regionName, tileRegionId, regionBbox
                    ));
                }
            );
        } catch (Throwable e) {
            String msg = "스타일 팩 다운로드 설정 오류: " + e.getMessage();
            updateStatus(msg);
            if (call != null) call.reject(msg);
        }
    }

    private void startTileRegionDownload(
        PluginCall call,
        long generation,
        String regionId,
        String regionName,
        String tileRegionId,
        double[] regionBbox
    ) {
        try {
            if (generation != downloadGeneration) return;
            ensureOfflineManagers();

            final String styleUri = !TextUtils.isEmpty(STYLE_STANDARD_SATELLITE)
                ? STYLE_STANDARD_SATELLITE
                : "mapbox://styles/mapbox/standard-satellite";

            double minLng = regionBbox[0];
            double minLat = regionBbox[1];
            double maxLng = regionBbox[2];
            double maxLat = regionBbox[3];

            List<Point> ring = Arrays.asList(
                Point.fromLngLat(minLng, minLat),
                Point.fromLngLat(maxLng, minLat),
                Point.fromLngLat(maxLng, maxLat),
                Point.fromLngLat(minLng, maxLat),
                Point.fromLngLat(minLng, minLat)
            );
            Polygon bboxPolygon = Polygon.fromLngLats(Collections.singletonList(ring));

            // Descriptor 1: Standard Satellite (Z10 ~ Z16)
            TilesetDescriptor satDescriptor = offlineManager.createTilesetDescriptor(
                new TilesetDescriptorOptions.Builder()
                    .styleURI(styleUri)
                    .minZoom(SAT_MIN_ZOOM)
                    .maxZoom(SAT_MAX_ZOOM)
                    .pixelRatio(1.0f)
                    .build()
            );

            // Descriptor 2: Terrain DEM 3D elevation tiles (Z10 ~ Z14)
            // Mapbox SDK 11.9.0 TilesetDescriptorOptions.Builder requires non-null styleURI on build()
            TilesetDescriptor demDescriptor = offlineManager.createTilesetDescriptor(
                new TilesetDescriptorOptions.Builder()
                    .styleURI(styleUri)
                    .tilesets(Collections.singletonList(DEM_TILESET_URI))
                    .minZoom(DEM_MIN_ZOOM)
                    .maxZoom(DEM_MAX_ZOOM)
                    .pixelRatio(1.0f)
                    .build()
            );

            TileRegionLoadOptions regionLoadOptions = new TileRegionLoadOptions.Builder()
                .geometry(bboxPolygon)
                .descriptors(Arrays.asList(satDescriptor, demDescriptor))
                .acceptExpired(true)
                .build();

            updateStatus("2/2 " + regionName + " 위성 + 3D DEM 타일 리전 다운로드 시작...");

            activeTileCancelable = tileStore.loadTileRegion(
                tileRegionId,
                regionLoadOptions,
                progress -> {
                    if (generation != downloadGeneration) return;
                    long done = progress.getCompletedResourceCount();
                    long req = Math.max(1, progress.getRequiredResourceCount());
                    double mb = progress.getCompletedResourceSize() / (1024.0 * 1024.0);
                    int pct = (int) Math.min(100, (done * 100) / req);
                    mainHandler.post(() -> updateStatus(String.format(
                        Locale.KOREA,
                        "2/2 %s 위성+DEM 타일 다운로드 중: %d%% (%d/%d 타일, %.2f MB)",
                        regionName, pct, done, req, mb
                    )));
                },
                expected -> {
                    if (generation != downloadGeneration) return;
                    if (expected.isError()) {
                        TileRegionError err = expected.getError();
                        String msg = "타일 다운로드 실패: " + (err != null ? err.getType() + " - " + err.getMessage() : "알 수 없는 오류");
                        mainHandler.post(() -> updateStatus(msg));
                        if (call != null) call.reject(msg);
                    } else {
                        TileRegion region = expected.getValue();
                        long count = region != null ? region.getCompletedResourceCount() : 0;
                        long required = region != null ? region.getRequiredResourceCount() : 0;
                        boolean complete = region != null && count > 0 && (required == 0 || count >= required);
                        if (!complete) {
                            String msg = String.format(
                                Locale.KOREA,
                                "타일 다운로드 미완료: %d/%d 리소스. 완료 상태로 저장하지 않습니다.",
                                count, required
                            );
                            mainHandler.post(() -> updateStatus(msg));
                            if (call != null) call.reject(msg);
                            return;
                        }
                        double mb = region != null ? (region.getCompletedResourceSize() / (1024.0 * 1024.0)) : 0.0;
                        String okMsg = String.format(
                            Locale.KOREA,
                            "다운로드 완료! %s 위성+3D DEM (%d 리소스, %.2f MB) 저장됨. 이제 비행기 모드에서 확인하세요.",
                            regionName, count, mb
                        );
                        mainHandler.post(() -> {
                            updateStatus(okMsg);
                            if (mapView != null && regionId.equals(activeRegionId)) {
                                setupMapStyleAnd3DTerrain();
                                moveCameraToActiveRegion3D();
                            }
                        });
                        if (call != null) {
                            JSObject ret = new JSObject();
                            ret.put("regionId", regionId);
                            ret.put("regionName", regionName);
                            ret.put("tileRegionId", tileRegionId);
                            ret.put("includesTerrainDemDescriptor", true);
                            ret.put("complete", true);
                            ret.put("completedResourceCount", count);
                            ret.put("sizeMb", mb);
                            call.resolve(ret);
                        }
                    }
                }
            );
        } catch (Throwable e) {
            String msg = "타일 리전 다운로드 설정 오류: " + e.getMessage();
            updateStatus(msg);
            if (call != null) call.reject(msg);
        }
    }

    private void queryOfflineInventory(PluginCall call) {
        ensureOfflineManagers();
        String requestedRegionId = call != null ? call.getString("regionId") : null;
        if (!TextUtils.isEmpty(requestedRegionId)) {
            requestedRegionId = requestedRegionId.trim().toLowerCase(Locale.ROOT);
            if (!requestedRegionId.matches("[a-z0-9][a-z0-9._-]{0,63}")) {
                call.reject("regionId 형식이 올바르지 않습니다.");
                return;
            }
        }
        final String statusRegionId = TextUtils.isEmpty(requestedRegionId) ? activeRegionId : requestedRegionId;
        final String statusRegionName = statusRegionId.equals(activeRegionId) ? activeRegionName : statusRegionId;
        final String statusTileRegionId = tileRegionIdFor(statusRegionId);
        tileStore.getAllTileRegions(expected -> {
            if (expected.isError()) {
                String msg = "TileStore 조회 오류: " + expected.getError().getMessage();
                mainHandler.post(() -> updateStatus(msg));
                if (call != null) call.reject(msg);
                return;
            }
            List<TileRegion> regions = expected.getValue();
            TileRegion matchedRegion = null;
            if (regions != null) {
                for (TileRegion r : regions) {
                    if (statusTileRegionId.equals(r.getId())) {
                        matchedRegion = r;
                        break;
                    }
                }
            }
            final TileRegion found = matchedRegion;
            offlineManager.getAllStylePacks(styleExpected -> {
                int styleCount = (styleExpected.isValue() && styleExpected.getValue() != null)
                    ? styleExpected.getValue().size() : 0;
                mainHandler.post(() -> {
                    if (found != null) {
                        double mb = found.getCompletedResourceSize() / (1024.0 * 1024.0);
                        boolean complete = styleCount > 0 && (found.getRequiredResourceCount() == 0
                            ? found.getCompletedResourceCount() > 0
                            : found.getCompletedResourceCount() >= found.getRequiredResourceCount());
                        updateStatus(String.format(
                            Locale.KOREA,
                            "%s 오프라인 저장 %s: [%s] 타일 %d/%d (%.2f MB), 스타일팩 %d개",
                            statusRegionName,
                            complete ? "완료" : "미완료",
                            found.getId(),
                            found.getCompletedResourceCount(),
                            found.getRequiredResourceCount(),
                            mb,
                            styleCount
                        ));
                    } else {
                        updateStatus(String.format(
                            Locale.KOREA,
                            "저장된 %s 타일 리전 없음 (스타일팩 %d개). 다운로드 후 다시 확인하세요.",
                            statusRegionName, styleCount
                        ));
                    }
                });
                if (call != null) {
                    long completed = found != null ? found.getCompletedResourceCount() : 0;
                    long required = found != null ? found.getRequiredResourceCount() : 0;
                    boolean complete = found != null && styleCount > 0
                        && (required == 0 ? completed > 0 : completed >= required);
                    JSObject ret = new JSObject();
                    ret.put("regionId", statusRegionId);
                    ret.put("tileRegionId", statusTileRegionId);
                    ret.put("downloaded", found != null);
                    ret.put("complete", complete);
                    ret.put("hasDongtanRegion", "dongtan".equals(statusRegionId) && found != null);
                    ret.put("completedResourceCount", completed);
                    ret.put("requiredResourceCount", required);
                    ret.put("sizeBytes", found != null ? found.getCompletedResourceSize() : 0);
                    ret.put("stylePackCount", styleCount);
                    call.resolve(ret);
                }
            });
        });
    }

    private void clearDongtanOfflineCache() {
        ensureOfflineManagers();
        cancelActiveDownloads();
        tileStore.removeTileRegion(DONGTAN_TILE_REGION_ID);
        updateStatus("동탄 타일 리전 삭제 요청 완료. 다른 지역과 공유하는 스타일 팩은 유지합니다.");
    }

    private void toggleMapboxOfflineSwitch() {
        mapboxOfflineForced = !mapboxOfflineForced;
        OfflineSwitch.getInstance().setMapboxStackConnected(!mapboxOfflineForced);
        if (offlineSwitchBtn != null) {
            offlineSwitchBtn.setText(mapboxOfflineForced ? "Mapbox망: 오프라인(차단됨)" : "Mapbox망: 온라인");
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor(mapboxOfflineForced ? "#D97706" : "#059669"));
            bg.setCornerRadius(dp(getActivity(), 8));
            offlineSwitchBtn.setBackground(bg);
        }
        updateStatus(mapboxOfflineForced
            ? "Mapbox 네트워크 스택이 강제 오프라인(차단) 전환되었습니다. 로컬 TileStore 캐시만 사용합니다."
            : "Mapbox 네트워크 스택이 온라인으로 복귀되었습니다.");
    }

    private void moveCameraToDongtan3D() {
        moveCameraToActiveRegion3D();
    }

    private void moveCameraToActiveRegion3D() {
        if (mapView == null) {
            Log.e(TAG, "moveCameraToActiveRegion3D failed: mapView is null");
            updateStatus("오류: MapView가 생성되지 않아 시점을 이동할 수 없습니다.");
            return;
        }
        try {
            CameraOptions cameraOptions = new CameraOptions.Builder()
                .center(Point.fromLngLat(activeCenter[0], activeCenter[1]))
                .zoom(14.8)
                .pitch(60.0)
                .bearing(28.0)
                .build();
            mapView.getMapboxMap().setCamera(cameraOptions);
            Log.i(TAG, "Moved camera to offline region 3D: " + activeRegionId + " " + activeCenter[0] + "," + activeCenter[1]);
            updateStatus(String.format(
                Locale.KOREA,
                "%s 3D 지형 시점 이동 (중심 %.4f, %.4f / Pitch 60° / Zoom 14.8)",
                activeRegionName, activeCenter[1], activeCenter[0]
            ));
        } catch (Throwable e) {
            Log.e(TAG, "moveCameraToActiveRegion3D error", e);
            updateStatus("카메라 이동 오류: " + e.getMessage());
        }
    }

    private void enableAndCenterGps() {
        Activity activity = getActivity();
        if (activity == null) return;
        if (!hasLocationPermission(activity)) {
            ActivityCompat.requestPermissions(
                activity,
                new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                },
                7701
            );
            updateStatus("위치(GPS) 권한을 허용한 뒤 다시 [내 위치(GPS)]를 눌러주세요.");
            return;
        }
        enableLocationComponentIfPermitted();
        if (lastKnownGpsFix != null) {
            if (mapView != null) {
                mapView.getMapboxMap().setCamera(
                    new CameraOptions.Builder()
                        .center(Point.fromLngLat(lastKnownGpsFix.getLongitude(), lastKnownGpsFix.getLatitude()))
                        .zoom(15.0)
                        .pitch(50.0)
                        .build()
                );
            }
            updateStatus(String.format(
                Locale.KOREA,
                "현재 GPS 위치 이동: 위도 %.5f, 경도 %.5f (±%.0fm)",
                lastKnownGpsFix.getLatitude(),
                lastKnownGpsFix.getLongitude(),
                lastKnownGpsFix.getAccuracy()
            ));
        } else {
            updateStatus("GPS 수신 대기 중... 야외(또는 창가)에서 위치가 수신되면 자동 표시됩니다.");
        }
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            enableLocationComponentIfPermitted();
        }
    }

    private boolean hasLocationPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("MissingPermission")
    private void enableLocationComponentIfPermitted() {
        Activity activity = getActivity();
        if (activity == null || !hasLocationPermission(activity)) return;

        if (mapView != null) {
            try {
                LocationComponentPlugin locPlugin = LocationComponentUtils.getLocationComponent(mapView);
                locPlugin.setEnabled(true);
            } catch (Throwable e) {
                Log.w(TAG, "LocationComponentPlugin enable warning: " + e.getMessage());
            }
        }

        try {
            if (locationManager == null) {
                locationManager = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
            }
            if (locationManager != null && locationListener == null) {
                locationListener = new LocationListener() {
                    @Override
                    public void onLocationChanged(@NonNull Location location) {
                        lastKnownGpsFix = location;
                        mainHandler.post(() -> updateStatus(String.format(
                            Locale.KOREA,
                            "GPS 수신됨: 위도 %.5f, 경도 %.5f (±%.0fm)",
                            location.getLatitude(),
                            location.getLongitude(),
                            location.getAccuracy()
                        )));
                    }

                    @Override
                    public void onStatusChanged(String provider, int status, Bundle extras) {}

                    @Override
                    public void onProviderEnabled(@NonNull String provider) {}

                    @Override
                    public void onProviderDisabled(@NonNull String provider) {}
                };

                for (String provider : Arrays.asList(
                    LocationManager.GPS_PROVIDER,
                    LocationManager.NETWORK_PROVIDER,
                    LocationManager.PASSIVE_PROVIDER
                )) {
                    try {
                        if (locationManager.isProviderEnabled(provider)) {
                            locationManager.requestLocationUpdates(
                                provider, 2000L, 1f, locationListener
                            );
                        }
                        Location cached = locationManager.getLastKnownLocation(provider);
                        if (cached != null && (lastKnownGpsFix == null || cached.getTime() > lastKnownGpsFix.getTime())) {
                            lastKnownGpsFix = cached;
                        }
                    } catch (Throwable ignored) {
                    }
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "LocationManager setup warning: " + e.getMessage());
        }
    }

    private void updateBboxSummaryText() {
        if (bboxInfoView == null) return;
        bboxInfoView.setText(String.format(
            Locale.KOREA,
            "%s (%s) | 출처: %s | BBox: [%.4f, %.4f ~ %.4f, %.4f] | 위성 Z%d~Z%d, 3D DEM Z%d~Z%d",
            activeRegionName,
            activeRegionId,
            activeBboxSource,
            activeBbox[0], activeBbox[1], activeBbox[2], activeBbox[3],
            SAT_MIN_ZOOM, SAT_MAX_ZOOM, DEM_MIN_ZOOM, DEM_MAX_ZOOM
        ));
    }

    private void updateStatus(String text) {
        Log.d(TAG, text);
        if (statusTextView != null) {
            statusTextView.setText("상태: " + text);
        }
    }

    private Button createActionButton(Context context, String label, String hexColor) {
        Button btn = new Button(context);
        btn.setText(label);
        btn.setAllCaps(false);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        int padH = dp(context, 10);
        int padV = dp(context, 6);
        btn.setPadding(padH, padV, padH, padV);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(hexColor));
        bg.setCornerRadius(dp(context, 8));
        btn.setBackground(bg);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        lp.rightMargin = dp(context, 6);
        btn.setLayoutParams(lp);
        return btn;
    }

    private void cancelActiveDownloads() {
        downloadGeneration++;
        if (activeStyleCancelable != null) {
            try { activeStyleCancelable.cancel(); } catch (Exception ignored) {}
            activeStyleCancelable = null;
        }
        if (activeTileCancelable != null) {
            try { activeTileCancelable.cancel(); } catch (Exception ignored) {}
            activeTileCancelable = null;
        }
    }

    private void dismissTestDialog() {
        if (testDialog != null) {
            try {
                if (testDialog.isShowing()) testDialog.dismiss();
            } catch (Exception ignored) {
            }
            testDialog = null;
        }
        cleanupDialogResources();
    }

    private void cleanupDialogResources() {
        cancelActiveDownloads();
        if (mapboxOfflineForced) {
            mapboxOfflineForced = false;
            try {
                OfflineSwitch.getInstance().setMapboxStackConnected(true);
            } catch (Exception ignored) {
            }
        }
        if (locationManager != null && locationListener != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {
            }
            locationListener = null;
        }
        if (mapView != null) {
            try {
                mapView.onStop();
                mapView.onDestroy();
            } catch (Exception ignored) {
            }
            mapView = null;
        }
    }

    private static String readStream(InputStream in) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static int dp(Context context, float value) {
        if (context == null) return (int) value;
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value,
            context.getResources().getDisplayMetrics()
        );
    }
}

