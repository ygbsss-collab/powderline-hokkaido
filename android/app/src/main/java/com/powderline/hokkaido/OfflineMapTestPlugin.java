package com.powderline.hokkaido;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
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
import android.view.MotionEvent;
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
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ViewTreeLifecycleOwner;
import androidx.lifecycle.ViewTreeViewModelStoreOwner;
import androidx.lifecycle.ViewModelStoreOwner;
import androidx.savedstate.SavedStateRegistryOwner;
import androidx.savedstate.ViewTreeSavedStateRegistryOwner;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.mapbox.bindgen.DataRef;
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
import com.mapbox.maps.CameraState;
import com.mapbox.maps.GlyphsRasterizationMode;
import com.mapbox.maps.Image;
import com.mapbox.maps.ImageContent;
import com.mapbox.maps.ImageStretches;
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
import com.mapbox.android.gestures.MoveGestureDetector;
import com.mapbox.android.gestures.RotateGestureDetector;
import com.mapbox.android.gestures.ShoveGestureDetector;
import com.mapbox.maps.EdgeInsets;
import com.mapbox.maps.ScreenCoordinate;
import com.mapbox.maps.ImageHolder;
import com.mapbox.maps.plugin.LocationPuck2D;
import com.mapbox.maps.plugin.PuckBearing;
import com.mapbox.maps.plugin.animation.CameraAnimationsUtils;
import com.mapbox.maps.plugin.animation.MapAnimationOptions;
import com.mapbox.maps.plugin.gestures.GesturesPlugin;
import com.mapbox.maps.plugin.gestures.GesturesUtils;
import com.mapbox.maps.plugin.gestures.OnMoveListener;
import com.mapbox.maps.plugin.gestures.OnRotateListener;
import com.mapbox.maps.plugin.gestures.OnShoveListener;
import com.mapbox.maps.plugin.locationcomponent.LocationComponentPlugin;
import com.mapbox.maps.plugin.locationcomponent.LocationComponentUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
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

    // Ski lift/run GeoJSON: Supabase Storage (ski-data bucket) -> app internal storage -> Mapbox line layers.
    private static final String SKI_DIR_NAME = "ski-data";
    private static final String SKI_BUNDLED_ASSET_DIR = "public/data/ski/";
    private static final String SKI_SOURCE_ID = "powderline-ski-facilities";
    private static final String SKI_TOWERS_SOURCE_ID = "powderline-ski-lift-towers";
    private static final String SKI_TERMINALS_SOURCE_ID = "powderline-ski-lift-terminals";
    private static final String[] SKI_LAYER_IDS = new String[]{
        "powderline-ski-runs", "powderline-ski-lifts-casing", "powderline-ski-lifts",
        "powderline-ski-lift-towers", "powderline-ski-lift-terminals"
    };
    private static final int SKI_MAX_BYTES = 6 * 1024 * 1024;
    private static final int SKI_HTTP_TIMEOUT_MS = 15000;

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
    // Context ring: low-zoom imagery/DEM around the region so a tilted 3D view (horizon / edges) is not black offline.
    private static final String CONTEXT_REGION_SUFFIX = "-context";
    private static final byte CONTEXT_SAT_MIN_ZOOM = 8;
    private static final byte CONTEXT_SAT_MAX_ZOOM = 13;
    private static final byte CONTEXT_DEM_MIN_ZOOM = 8;
    private static final byte CONTEXT_DEM_MAX_ZOOM = 12;
    private static final int DOWNLOAD_PROFILE_VERSION = 2;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

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
    // One region download at a time. The PluginCall is settled exactly once (resolve/reject/cancel) and then cleared.
    private PluginCall activeDownloadCall;
    private String activeDownloadRegionId = "";
    private String activeDownloadJobId = "";

    private boolean mapboxOfflineForced = false;
    private String activeRegionId = "dongtan";
    private String activeRegionName = "동탄";
    private String activeTileRegionId = DONGTAN_TILE_REGION_ID;
    private double[] activeBbox = EXPLICIT_DONGTAN_BBOX.clone();
    private double[] activeCenter = EXPLICIT_DONGTAN_CENTER.clone();
    private String activeBboxSource = "명시적 시험용 BBox (기본값)";
    private String activeSkiDataStatus = "";
    private String activeSkiDataVersion = "";
    private String activeSupabaseUrl = DEFAULT_SUPABASE_URL;
    private String skiOverlayLabel = "스키 데이터 확인 중";
    private final java.util.Map<String, JSONObject> skiOutcomes = new java.util.concurrent.ConcurrentHashMap<>();

    private LocationManager locationManager;
    private LocationListener locationListener;
    private Location lastKnownGpsFix;
    // GPS auto-follow: on after [내 위치(GPS)], off when the user moves/rotates/tilts the map by hand.
    private boolean gpsFollowActive = false;
    private boolean gpsGesturesHooked = false;
    private boolean gpsDragging = false;          // a drag/pinch is in progress: follow is suspended, not ended
    private float gpsDragZoom = 0f;
    private int gpsDragMaxPointers = 0;
    private boolean gpsRecenterNext = false;      // next position recenters (locate button / screen-on restore)
    private boolean gpsFollowResume = false;      // follow was active when the app went to the background

    // Embedded mode: the same Native MapView placed UNDER the transparent Capacitor WebView (the web UI stays on top).
    private FrameLayout embeddedContainer;
    private String embeddedRegionId = "";
    private boolean embeddedForwardingTouch = false;
    private boolean[] embeddedHitGrid;
    private int embeddedGridCols = 0;
    private int embeddedGridRows = 0;
    private float embeddedGridCell = 16f;      // CSS px per grid cell
    private float embeddedMapLeftCss = 0f, embeddedMapTopCss = 0f, embeddedMapWidthCss = 0f, embeddedMapHeightCss = 0f;
    private int embeddedPrevWebBackground = Color.WHITE;
    // Web -> native overlay state (re-applied whenever the style (re)loads)
    private static final String ROUTE_SOURCE_ID = "powderline-route";
    private static final String ROUTE_GLOW_LAYER_ID = "powderline-route-glow";
    private static final String ROUTE_LINE_LAYER_ID = "powderline-route-line";
    private static final String CURSOR_SOURCE_ID = "powderline-profile-cursor";
    private static final String CURSOR_LAYER_ID = "powderline-profile-cursor";
    private static final String CURSOR_IMAGE_ID = "powderline-profile-cross";
    private static final double TERRAIN_EXAGGERATION = 1.5; // same value as setStyleTerrain below
    private String embeddedRouteJson = "{\"type\":\"FeatureCollection\",\"features\":[]}";
    private double[] embeddedCursor = null;
    private boolean embeddedCameraEventPending = false;
    private int embeddedLoadingErrorCount = 0;
    private final List<Cancelable> embeddedSubscriptions = new ArrayList<>();

    @Override
    public void load() {
        super.load();
        loadCachedMetadata();
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
        activeSkiDataStatus = "";
        activeSkiDataVersion = "";
        activeSupabaseUrl = DEFAULT_SUPABASE_URL;
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
        // Offline re-entry: fill anything the caller omitted from the region saved on this device.
        JSONObject savedRegion = readRegionMeta(regionId);
        if (savedRegion != null) {
            if (TextUtils.isEmpty(regionName)) regionName = savedRegion.optString("regionName", "").trim();
            if (center == null) center = savedRegion.optJSONArray("center");
            if (bounds == null) bounds = savedRegion.optJSONArray("bbox");
        }
        String requestedSkiStatus = data.optString("skiDataStatus", "").trim().toLowerCase(Locale.ROOT);
        String requestedSkiVersion = data.optString("skiDataVersion", "").trim();
        String requestedSupabaseUrl = data.optString("supabaseUrl", "").trim();
        if (!requestedSupabaseUrl.startsWith("https://")) requestedSupabaseUrl = DEFAULT_SUPABASE_URL;
        if (requestedSupabaseUrl.endsWith("/")) requestedSupabaseUrl = requestedSupabaseUrl.substring(0, requestedSupabaseUrl.length() - 1);
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
            activeSkiDataStatus = requestedSkiStatus;
            activeSkiDataVersion = requestedSkiVersion;
            activeSupabaseUrl = requestedSupabaseUrl;
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
     * Shows the offline Native map inside the main screen: the MapView sits under the (transparent) WebView, so the web
     * header / bottom menu / graph stay on top. Touches on "map cells" (reported by the web page) are forwarded to the MapView.
     */
    @PluginMethod
    public void showEmbeddedMap(PluginCall call) {
        mainHandler.post(() -> {
            try {
                configureActiveRegion(call);
            } catch (IllegalArgumentException error) {
                call.reject(error.getMessage());
                return;
            }
            if (testDialog != null && testDialog.isShowing()) dismissTestDialog();
            if (embeddedContainer != null && activeRegionId.equals(embeddedRegionId) && mapView != null) {
                applyEmbeddedLayout(call.getData());
                JSObject same = new JSObject();
                same.put("shown", true);
                same.put("regionId", activeRegionId);
                call.resolve(same);
                return;
            }
            destroyEmbeddedMap();
            syncTokenAndRegionBeforeOpen(false, () -> {
                Activity activity = getActivity();
                if (activity == null || activity.isFinishing()) {
                    call.reject("Activity unavailable");
                    return;
                }
                if (!createEmbeddedMap(activity)) {
                    call.reject("Native 지도를 화면에 붙이지 못했습니다.");
                    return;
                }
                applyEmbeddedLayout(call.getData());
                JSObject ret = new JSObject();
                ret.put("shown", true);
                ret.put("regionId", activeRegionId);
                ret.put("tileRegionId", activeTileRegionId);
                call.resolve(ret);
            });
        });
    }

    /** Position / visibility / touch map of the embedded map. Resolves shown=false when no embedded map exists. */
    @PluginMethod
    public void setEmbeddedMapLayout(PluginCall call) {
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            boolean ok = embeddedContainer != null && mapView != null && applyEmbeddedLayout(call.getData());
            ret.put("shown", ok);
            call.resolve(ret);
        });
    }

    /** Web "my location" button while the Native map is shown: show my position, recenter, (re)activate follow. */
    @PluginMethod
    public void centerEmbeddedGps(PluginCall call) {
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            boolean ok = mapView != null;
            if (ok) enableAndCenterGps();
            ret.put("ok", ok);
            call.resolve(ret);
        });
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        gpsFollowResume = gpsFollowActive;
    }

    /** Screen back on: Android throttles background location updates, so re-register and restore follow. */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (mapView == null) return;
        mainHandler.post(() -> {
            if (mapView == null) return;
            gpsDragging = false; // a gesture cut off by the screen turning off must not leave follow suspended
            restartLocationUpdates();
            if (gpsFollowResume) {
                gpsFollowActive = true;
                gpsDragging = false;
                gpsRecenterNext = true;
                if (lastKnownGpsFix != null) followGpsIfNeeded(lastKnownGpsFix, true);
            }
        });
    }

    private void restartLocationUpdates() {
        if (locationManager != null && locationListener != null) {
            try { locationManager.removeUpdates(locationListener); } catch (Exception ignored) { }
            locationListener = null;
        }
        enableLocationComponentIfPermitted();
    }

    /** GPX route FeatureCollection from the web (same features/colours as the online route layer). */
    @PluginMethod
    public void setEmbeddedRoute(PluginCall call) {
        final String json = call.getString("geojson", "");
        mainHandler.post(() -> {
            if (!TextUtils.isEmpty(json)) embeddedRouteJson = json;
            setSourceData(ROUTE_SOURCE_ID, embeddedRouteJson);
            call.resolve();
        });
    }

    /** Yellow cross for the point selected on the slope graph: {lng,lat} or {clear:true}. */
    @PluginMethod
    public void setEmbeddedProfileMarker(PluginCall call) {
        final boolean clear = call.getBoolean("clear", false);
        final Double lng = call.getDouble("lng");
        final Double lat = call.getDouble("lat");
        mainHandler.post(() -> {
            embeddedCursor = (!clear && lng != null && lat != null) ? new double[]{lng, lat} : null;
            setSourceData(CURSOR_SOURCE_ID, cursorGeoJson());
            call.resolve();
        });
    }

    /** HUD buttons: cmd = zoomIn | zoomOut | north | tilt | fit(bounds=[w,s,e,n], padding, maxZoom). */
    @PluginMethod
    public void embeddedCamera(PluginCall call) {
        final String cmd = call.getString("cmd", "");
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            if (mapView == null) { ret.put("ok", false); call.resolve(ret); return; }
            try {
                MapboxMap map = mapView.getMapboxMap();
                CameraState cs = map.getCameraState();
                CameraOptions.Builder b = new CameraOptions.Builder();
                long duration = 300L;
                if ("zoomIn".equals(cmd)) b.zoom(cs.getZoom() + 1.0);
                else if ("zoomOut".equals(cmd)) b.zoom(cs.getZoom() - 1.0);
                else if ("north".equals(cmd)) { b.bearing(0.0).pitch(0.0); duration = 600L; }
                else if ("tilt".equals(cmd)) { b.pitch(cs.getPitch() > 20.0 ? 0.0 : 58.0); duration = 700L; }
                else if ("fit".equals(cmd)) {
                    JSONArray bb = call.getData().optJSONArray("bounds");
                    if (bb == null || bb.length() != 4) { ret.put("ok", false); call.resolve(ret); return; }
                    float d = getActivity() != null ? getActivity().getResources().getDisplayMetrics().density : 1f;
                    double pad = call.getData().optDouble("padding", 90.0) * d;
                    double maxZoom = call.getData().optDouble("maxZoom", 13.0);
                    List<Point> pts = new ArrayList<>();
                    pts.add(Point.fromLngLat(bb.getDouble(0), bb.getDouble(1)));
                    pts.add(Point.fromLngLat(bb.getDouble(2), bb.getDouble(3)));
                    CameraOptions fit = map.cameraForCoordinates(pts,
                        new CameraOptions.Builder().bearing(cs.getBearing()).pitch(cs.getPitch()).build(),
                        new EdgeInsets(pad, pad, pad, pad), maxZoom, null);
                    b = new CameraOptions.Builder(); // keep only what the fit computed (no follow padding carry-over)
                    if (fit.getCenter() != null) b.center(fit.getCenter());
                    if (fit.getZoom() != null) b.zoom(Math.min(maxZoom, fit.getZoom()));
                    stopGpsFollow(); // the user asked to look at a course: do not snap back to the GPS position
                    duration = 900L;
                } else { ret.put("ok", false); call.resolve(ret); return; }
                CameraAnimationsUtils.getCamera(mapView).easeTo(b.build(), new MapAnimationOptions.Builder().duration(duration).build(), null);
                ret.put("ok", true);
            } catch (Throwable e) {
                Log.w(TAG, "embeddedCamera(" + cmd + ") failed: " + e.getMessage());
                ret.put("ok", false);
            }
            call.resolve(ret);
        });
    }

    /** coords: [[lng,lat],...] -> mask string of '1'/'0' = inside the visible map view (for the graph range). */
    @PluginMethod
    public void projectEmbeddedVisible(PluginCall call) {
        final JSONArray coords = call.getData().optJSONArray("coords");
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            if (mapView == null || coords == null) { ret.put("mask", ""); call.resolve(ret); return; }
            try {
                List<Point> pts = new ArrayList<>();
                for (int i = 0; i < coords.length(); i++) {
                    JSONArray c = coords.getJSONArray(i);
                    pts.add(Point.fromLngLat(c.getDouble(0), c.getDouble(1)));
                }
                List<ScreenCoordinate> px = mapView.getMapboxMap().pixelsForCoordinates(pts);
                int w = mapView.getWidth(), h = mapView.getHeight();
                StringBuilder sb = new StringBuilder(px.size());
                for (ScreenCoordinate sc : px) {
                    boolean in = sc.getX() >= 0 && sc.getX() <= w && sc.getY() >= 0 && sc.getY() <= h;
                    sb.append(in ? '1' : '0');
                }
                ret.put("mask", sb.toString());
            } catch (Throwable e) {
                Log.w(TAG, "projectEmbeddedVisible failed: " + e.getMessage());
                ret.put("mask", "");
            }
            call.resolve(ret);
        });
    }

    /** Terrain elevation (metres, without exaggeration) from the Native DEM for the graph; null where tiles are not loaded. */
    @PluginMethod
    public void queryEmbeddedElevations(PluginCall call) {
        final JSONArray coords = call.getData().optJSONArray("coords");
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            JSONArray out = new JSONArray();
            try {
                if (mapView != null && coords != null) {
                    MapboxMap map = mapView.getMapboxMap();
                    for (int i = 0; i < coords.length(); i++) {
                        JSONArray c = coords.getJSONArray(i);
                        Double e = map.getElevation(Point.fromLngLat(c.getDouble(0), c.getDouble(1)));
                        if (e == null || e.isNaN()) out.put(JSONObject.NULL); else out.put(e / TERRAIN_EXAGGERATION);
                    }
                }
            } catch (Throwable e) {
                Log.w(TAG, "queryEmbeddedElevations failed: " + e.getMessage());
            }
            ret.put("elevations", out);
            call.resolve(ret);
        });
    }

    private void subscribeEmbeddedMapEvents() {
        if (mapView == null) return;
        MapboxMap map = mapView.getMapboxMap();
        embeddedSubscriptions.add(map.subscribeCameraChanged(cameraChanged -> {
            if (embeddedCameraEventPending) return;
            embeddedCameraEventPending = true;
            mainHandler.postDelayed(() -> {
                embeddedCameraEventPending = false;
                if (mapView == null) return;
                CameraState cs = mapView.getMapboxMap().getCameraState();
                JSObject o = new JSObject();
                o.put("zoom", cs.getZoom());
                o.put("bearing", cs.getBearing());
                o.put("pitch", cs.getPitch());
                notifyListeners("embeddedCamera", o);
            }, 100);
        }));
        embeddedSubscriptions.add(map.subscribeMapIdle(idle -> notifyListeners("embeddedIdle", new JSObject())));
        embeddedLoadingErrorCount = 0;
        embeddedSubscriptions.add(map.subscribeMapLoadingError(error -> {
            embeddedLoadingErrorCount++;
            if (embeddedLoadingErrorCount <= 40 || embeddedLoadingErrorCount % 100 == 0) {
                String tile = error.getTileId() != null
                    ? error.getTileId().getZ() + "/" + error.getTileId().getX() + "/" + error.getTileId().getY() : "-";
                Log.w(TAG, "MapLoadingError #" + embeddedLoadingErrorCount + " type=" + error.getType()
                    + " source=" + error.getSourceId() + " tile=" + tile + " region=" + activeRegionId
                    + " offline=" + mapboxOfflineForced + " msg=" + error.getMessage());
            }
        }));
    }

    @PluginMethod
    public void hideEmbeddedMap(PluginCall call) {
        mainHandler.post(() -> {
            destroyEmbeddedMap();
            JSObject ret = new JSObject();
            ret.put("shown", false);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void downloadRegion(PluginCall call) {
        mainHandler.post(() -> {
            if (activeDownloadCall != null) {
                // Starting another download would cancel the running one and leave its call unresolved forever.
                call.reject("다른 지역(" + activeDownloadRegionId + ")을 다운로드 중입니다.", "BUSY");
                return;
            }
            try {
                configureActiveRegion(call);
            } catch (IllegalArgumentException error) {
                call.reject(error.getMessage());
                return;
            }
            activeDownloadCall = call;
            activeDownloadRegionId = activeRegionId;
            activeDownloadJobId = call.getString("jobId", "");
            syncTokenAndRegionBeforeOpen(false, () -> startRegionDownload(call));
        });
    }

    /** Real cancel: stops the running StylePack/TileRegion load (stored resources stay) and settles the pending call. */
    @PluginMethod
    public void cancelRegionDownload(PluginCall call) {
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            String regionId = call.getString("regionId", "");
            String jobId = call.getString("jobId", "");
            boolean matches = activeDownloadCall != null
                && (regionId.isEmpty() || regionId.equals(activeDownloadRegionId))
                && (jobId.isEmpty() || jobId.equals(activeDownloadJobId));
            if (!matches) {
                ret.put("cancelled", false);
                ret.put("reason", activeDownloadCall == null ? "idle" : "other-job");
                call.resolve(ret);
                return;
            }
            ret.put("cancelled", true);
            ret.put("regionId", activeDownloadRegionId);
            cancelActiveDownloads();
            updateStatus("다운로드가 취소되었습니다. 이미 저장된 타일은 유지됩니다.");
            reapplyEmbeddedNetworkBlock();
            call.resolve(ret);
        });
    }

    /** Settles the in-flight download call once and frees the single download slot. */
    private void rejectDownload(PluginCall call, String msg) {
        if (call != null && call == activeDownloadCall) activeDownloadCall = null;
        if (call != null) call.reject(msg);
    }

    @PluginMethod
    public void getOfflineStatus(PluginCall call) {
        mainHandler.post(() -> queryOfflineInventory(call));
    }

    /**
     * Refreshes only the ski lift/run GeoJSON of an already saved region (no tile download). The saved region
     * name/center/bbox are kept; a failed refresh keeps the existing local file (see fetchAndStoreSkiData).
     */
    @PluginMethod
    public void refreshSkiData(PluginCall call) {
        final JSONObject data = call.getData();
        final String regionId = data.optString("regionId", "").trim().toLowerCase(Locale.ROOT);
        if (!regionId.matches("[a-z0-9][a-z0-9._-]{0,63}")) {
            call.reject("regionId 형식이 올바르지 않습니다.");
            return;
        }
        final String dbStatus = data.optString("skiDataStatus", "").trim().toLowerCase(Locale.ROOT);
        final String version = data.optString("skiDataVersion", "").trim();
        String requestedUrl = data.optString("supabaseUrl", "").trim();
        if (!requestedUrl.startsWith("https://")) requestedUrl = DEFAULT_SUPABASE_URL;
        if (requestedUrl.endsWith("/")) requestedUrl = requestedUrl.substring(0, requestedUrl.length() - 1);
        final String supabaseUrl = requestedUrl;
        ioExecutor.execute(() -> {
            try {
                JSONObject meta = readRegionMeta(regionId);
                String regionName;
                double[] center;
                double[] bbox;
                String tileRegionId;
                if (meta != null && meta.optJSONArray("center") != null && meta.optJSONArray("bbox") != null) {
                    regionName = meta.optString("regionName", regionId);
                    JSONArray c = meta.getJSONArray("center");
                    JSONArray b = meta.getJSONArray("bbox");
                    center = new double[]{c.getDouble(0), c.getDouble(1)};
                    bbox = new double[]{b.getDouble(0), b.getDouble(1), b.getDouble(2), b.getDouble(3)};
                    tileRegionId = meta.optString("tileRegionId", tileRegionIdFor(regionId));
                } else {
                    // Region downloaded before ski data was supported: use the values supplied by the caller.
                    JSONArray c = data.optJSONArray("center");
                    JSONArray b = data.optJSONArray("bounds");
                    if (c == null || c.length() != 2 || b == null || b.length() != 4) {
                        call.reject("저장된 지역 정보가 없고 center/bounds도 전달되지 않았습니다.");
                        return;
                    }
                    regionName = data.optString("regionName", regionId);
                    center = new double[]{c.getDouble(0), c.getDouble(1)};
                    bbox = new double[]{b.getDouble(0), b.getDouble(1), b.getDouble(2), b.getDouble(3)};
                    tileRegionId = tileRegionIdFor(regionId);
                }
                JSONObject outcome = fetchAndStoreSkiData(
                    regionId, regionName, center, bbox, tileRegionId, dbStatus, version, supabaseUrl
                );
                JSObject ret = new JSObject();
                ret.put("regionId", regionId);
                ret.put("skiData", outcome);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("스키 데이터 갱신 오류: " + e.getMessage());
            }
        });
    }

    /** Regions saved on this device (id, name, center, bbox, tile/ski-data state) for offline re-entry. */
    @PluginMethod
    public void listOfflineRegions(PluginCall call) {
        ioExecutor.execute(() -> {
            JSArray regions = new JSArray();
            File[] files = skiDir().listFiles((dir, name) -> name.endsWith(".meta.json"));
            if (files != null) {
                for (File file : files) {
                    String regionId = file.getName().substring(0, file.getName().length() - ".meta.json".length());
                    JSONObject meta = readRegionMeta(regionId);
                    if (meta == null) continue;
                    JSObject item = new JSObject();
                    item.put("regionId", regionId);
                    item.put("regionName", meta.optString("regionName"));
                    item.put("center", meta.optJSONArray("center"));
                    item.put("bbox", meta.optJSONArray("bbox"));
                    item.put("tileRegionId", meta.optString("tileRegionId"));
                    item.put("tileComplete", meta.optBoolean("tileComplete", false));
                    item.put("skiData", describeSkiData(regionId));
                    regions.put(item);
                }
            }
            JSObject ret = new JSObject();
            ret.put("regions", regions);
            call.resolve(ret);
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
                    try {
                        resolveTokenAndDongtanBbox(activity, token, supabaseUrl, supabaseKey, resolveDongtanRegion);
                    } catch (Throwable error) {
                        Log.w(TAG, "Token/region sync failed: " + error.getMessage());
                    }
                    mainHandler.post(onReady);
                })
            );
        } else {
            ioExecutor.execute(() -> {
                try {
                    resolveTokenAndDongtanBbox(activity, "", DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY, resolveDongtanRegion);
                } catch (Throwable error) {
                    Log.w(TAG, "Token/region sync failed: " + error.getMessage());
                }
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
        destroyEmbeddedMap();
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

    private boolean createEmbeddedMap(Activity activity) {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null || !(web.getParent() instanceof ViewGroup) || !(activity instanceof LifecycleOwner)) {
            Log.e(TAG, "Embedded map unavailable: webView/parent/lifecycle missing");
            return false;
        }
        try {
            LifecycleOwner lifecycleOwner = (LifecycleOwner) activity;
            ViewGroup parent = (ViewGroup) web.getParent();
            CameraOptions cameraOptions = new CameraOptions.Builder()
                .center(Point.fromLngLat(activeCenter[0], activeCenter[1]))
                .zoom(DEFAULT_ZOOM)
                .pitch(DEFAULT_PITCH)
                .bearing(DEFAULT_BEARING)
                .build();
            MapInitOptions initOptions = new MapInitOptions(activity);
            initOptions.setTextureView(true);
            initOptions.setCameraOptions(cameraOptions);
            mapView = new MapView(activity, initOptions);
            mapView.setVisibility(View.VISIBLE);

            FrameLayout container = new FrameLayout(activity);
            container.setBackgroundColor(Color.parseColor("#1E293B"));
            ViewTreeLifecycleOwner.set(container, lifecycleOwner);
            ViewTreeLifecycleOwner.set(mapView, lifecycleOwner);
            if (activity instanceof ViewModelStoreOwner) {
                ViewTreeViewModelStoreOwner.set(container, (ViewModelStoreOwner) activity);
                ViewTreeViewModelStoreOwner.set(mapView, (ViewModelStoreOwner) activity);
            }
            if (activity instanceof SavedStateRegistryOwner) {
                ViewTreeSavedStateRegistryOwner.set(container, (SavedStateRegistryOwner) activity);
                ViewTreeSavedStateRegistryOwner.set(mapView, (SavedStateRegistryOwner) activity);
            }
            container.addView(mapView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

            // Under the WebView in z-order (children are drawn in index order, so the WebView index is the top).
            int webIndex = Math.max(0, parent.indexOfChild(web));
            parent.addView(container, webIndex, new ViewGroup.MarginLayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            embeddedContainer = container;
            embeddedRegionId = activeRegionId;

            if (web.getBackground() instanceof ColorDrawable) {
                embeddedPrevWebBackground = ((ColorDrawable) web.getBackground()).getColor();
            }
            web.setBackgroundColor(Color.TRANSPARENT);
            web.setOnTouchListener((v, ev) -> forwardTouchToEmbeddedMap(v, ev));

            setEmbeddedNetworkBlocked(true);
            Log.i(TAG, String.format(Locale.US, "Embedded map pixelRatio=%.2f (download profile must match)", mapPixelRatio()));
            mapView.onStart();
            subscribeEmbeddedMapEvents();
            Log.i(TAG, "Embedded MapView created under WebView. Region=" + activeRegionId);
            setupMapStyleAnd3DTerrain();
            enableLocationComponentIfPermitted();
            return true;
        } catch (Throwable e) {
            Log.e(TAG, "Embedded MapView initialization failed", e);
            destroyEmbeddedMap();
            return false;
        }
    }

    /** data: { visible, rect:{left,top,width,height} (CSS px), grid:{cols,rows,cell,bits:"0/1 string"} } */
    private boolean applyEmbeddedLayout(JSONObject data) {
        if (embeddedContainer == null || data == null) return embeddedContainer != null;
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        float density = getActivity() != null ? getActivity().getResources().getDisplayMetrics().density : 1f;
        JSONObject rect = data.optJSONObject("rect");
        if (rect != null && rect.optDouble("width", 0) > 0 && rect.optDouble("height", 0) > 0) {
            embeddedMapLeftCss = (float) rect.optDouble("left", 0);
            embeddedMapTopCss = (float) rect.optDouble("top", 0);
            embeddedMapWidthCss = (float) rect.optDouble("width", 0);
            embeddedMapHeightCss = (float) rect.optDouble("height", 0);
            ViewGroup.LayoutParams raw = embeddedContainer.getLayoutParams();
            if (raw instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) raw;
                lp.width = Math.round(embeddedMapWidthCss * density);
                lp.height = Math.round(embeddedMapHeightCss * density);
                lp.leftMargin = (web != null ? web.getLeft() : 0) + Math.round(embeddedMapLeftCss * density);
                lp.topMargin = (web != null ? web.getTop() : 0) + Math.round(embeddedMapTopCss * density);
                embeddedContainer.setLayoutParams(lp);
            }
        }
        JSONObject grid = data.optJSONObject("grid");
        if (grid != null) {
            int cols = grid.optInt("cols", 0);
            int rows = grid.optInt("rows", 0);
            String bits = grid.optString("bits", "");
            if (cols > 0 && rows > 0 && bits.length() == cols * rows) {
                boolean[] cells = new boolean[bits.length()];
                for (int i = 0; i < bits.length(); i++) cells[i] = bits.charAt(i) == '1';
                embeddedHitGrid = cells;
                embeddedGridCols = cols;
                embeddedGridRows = rows;
                embeddedGridCell = (float) Math.max(1.0, grid.optDouble("cell", 16.0));
            }
        }
        if (data.has("visible")) {
            boolean visible = data.optBoolean("visible", true);
            embeddedContainer.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
            if (!visible) embeddedForwardingTouch = false;
        }
        return true;
    }

    private boolean isEmbeddedMapCell(float xPx, float yPx) {
        if (embeddedHitGrid == null || embeddedGridCols <= 0) return false;
        float density = getActivity() != null ? getActivity().getResources().getDisplayMetrics().density : 1f;
        float xCss = xPx / density;
        float yCss = yPx / density;
        if (xCss < embeddedMapLeftCss || yCss < embeddedMapTopCss
            || xCss > embeddedMapLeftCss + embeddedMapWidthCss || yCss > embeddedMapTopCss + embeddedMapHeightCss) return false;
        int col = (int) (xCss / embeddedGridCell);
        int row = (int) (yCss / embeddedGridCell);
        if (col < 0 || row < 0 || col >= embeddedGridCols || row >= embeddedGridRows) return false;
        return embeddedHitGrid[row * embeddedGridCols + col];
    }

    /**
     * Decides per gesture (at ACTION_DOWN) whether the touch belongs to the map or to the web UI. A gesture that
     * starts on a web button/menu/graph stays with the WebView; one that starts on the map goes entirely to the MapView.
     */
    private boolean forwardTouchToEmbeddedMap(View webView, MotionEvent ev) {
        if (embeddedContainer == null || mapView == null || embeddedContainer.getVisibility() != View.VISIBLE) return false;
        int action = ev.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            embeddedForwardingTouch = isEmbeddedMapCell(ev.getX(), ev.getY());
        }
        if (!embeddedForwardingTouch) return false;
        MotionEvent copy = MotionEvent.obtain(ev);
        try {
            // event coords are WebView-local; the container is positioned in the shared parent's coordinates
            copy.offsetLocation(webView.getLeft() - embeddedContainer.getLeft(), webView.getTop() - embeddedContainer.getTop());
            mapView.dispatchTouchEvent(copy);
        } finally {
            copy.recycle();
        }
        if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) embeddedForwardingTouch = false;
        return true;
    }

    private void destroyEmbeddedMap() {
        if (embeddedContainer == null) return;
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) {
            web.setOnTouchListener(null);
            web.setBackgroundColor(embeddedPrevWebBackground);
        }
        ViewGroup parent = embeddedContainer.getParent() instanceof ViewGroup ? (ViewGroup) embeddedContainer.getParent() : null;
        for (Cancelable c : embeddedSubscriptions) { try { c.cancel(); } catch (Throwable ignored) { } }
        embeddedSubscriptions.clear();
        cleanupDialogResources();
        if (parent != null) parent.removeView(embeddedContainer);
        embeddedContainer = null;
        embeddedRegionId = "";
        embeddedForwardingTouch = false;
        embeddedHitGrid = null;
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
        ensureEmbeddedOverlays(style);
        // Ski lifts/runs are independent of terrain: a failure here must not affect the map or terrain.
        addSkiOverlay(style);
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
        if (call != null && call != activeDownloadCall) return; // cancelled while the token/region sync was running
        try {
            String token = MapboxOptions.getAccessToken();
            if (TextUtils.isEmpty(token) || !token.startsWith("pk.")) {
                String msg = "오류: 유효한 Mapbox 토큰(pk.)이 없습니다. 온라인 상태에서 먼저 토큰을 로드하세요.";
                updateStatus(msg);
                rejectDownload(call, msg);
                return;
            }

            if (mapboxOfflineForced) {
                toggleMapboxOfflineSwitch();
            }

            ensureOfflineManagers();
            cancelDownloadWork();
            final long generation = downloadGeneration;
            final String regionId = activeRegionId;
            final String regionName = activeRegionName;
            final String tileRegionId = activeTileRegionId;
            final double[] regionBbox = activeBbox.clone();
            final double[] regionCenter = activeCenter.clone();
            final String skiStatus = activeSkiDataStatus;
            final String skiVersion = activeSkiDataVersion;
            final String supabaseUrl = activeSupabaseUrl;

            // Step 0: ski lift/run GeoJSON. Its result is reported separately (status/error) and a failure
            // never blocks the map tile download or removes a previously saved local file.
            updateStatus("0/2 지역 리프트·슬로프 데이터 확인 중...");
            ioExecutor.execute(() -> {
                JSONObject outcome = fetchAndStoreSkiData(
                    regionId, regionName, regionCenter, regionBbox, tileRegionId, skiStatus, skiVersion, supabaseUrl
                );
                skiOutcomes.put(regionId, outcome);
                mainHandler.post(() -> {
                    if (generation != downloadGeneration) return;
                    updateStatus(skiOutcomeText(regionName, outcome));
                    startStylePackDownload(call, generation, regionId, regionName, tileRegionId, regionBbox);
                });
            });
        } catch (Throwable e) {
            String msg = "스타일 팩 다운로드 설정 오류: " + e.getMessage();
            updateStatus(msg);
            rejectDownload(call, msg);
        }
    }

    private void startStylePackDownload(
        PluginCall call,
        long generation,
        String regionId,
        String regionName,
        String tileRegionId,
        double[] regionBbox
    ) {
        try {
            if (generation != downloadGeneration) return;
            final String styleUri = !TextUtils.isEmpty(STYLE_STANDARD_SATELLITE)
                ? STYLE_STANDARD_SATELLITE
                : "mapbox://styles/mapbox/standard-satellite";

            updateStatus("1/2 스타일 팩(Standard Satellite) 다운로드 시작...");

            StylePackLoadOptions styleOptions = new StylePackLoadOptions.Builder()
                .glyphsRasterizationMode(GlyphsRasterizationMode.IDEOGRAPHS_RASTERIZED_LOCALLY)
                .acceptExpired(true)
                .build();

            final DownloadReporter styleReporter = new DownloadReporter(regionId, "style");
            activeStyleCancelable = offlineManager.loadStylePack(
                styleUri,
                styleOptions,
                progress -> {
                    if (generation != downloadGeneration) return;
                    long done = progress.getCompletedResourceCount();
                    long req = Math.max(1, progress.getRequiredResourceCount());
                    styleReporter.report(done, progress.getRequiredResourceCount(), progress.getLoadedResourceSize(), progress.getErroredResourceCount(), done >= req);
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
                        mainHandler.post(() -> { updateStatus(msg); reapplyEmbeddedNetworkBlock(); });
                        rejectDownload(call, msg);
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
            rejectDownload(call, msg);
        }
    }

    /**
     * The 1x satellite set only belongs to regions that were already downloaded that way (it keeps those stored tiles
     * part of the region). A fresh download must not fetch every satellite tile a second time at 1x.
     */
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
            tileStore.getAllTileRegions(expected -> {
                boolean existing = false;
                if (expected.isValue() && expected.getValue() != null) {
                    for (TileRegion r : expected.getValue()) {
                        if (tileRegionId.equals(r.getId()) && r.getCompletedResourceCount() > 0) { existing = true; break; }
                    }
                }
                final boolean keepLegacy1x = existing;
                mainHandler.post(() -> startTileRegionDownloadWith(call, generation, regionId, regionName, tileRegionId, regionBbox, keepLegacy1x));
            });
        } catch (Throwable e) {
            startTileRegionDownloadWith(call, generation, regionId, regionName, tileRegionId, regionBbox, true);
        }
    }

    private void startTileRegionDownloadWith(
        PluginCall call,
        long generation,
        String regionId,
        String regionName,
        String tileRegionId,
        double[] regionBbox,
        boolean keepLegacy1x
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
            final float pixelRatio = mapPixelRatio();
            // Descriptor 1: Standard Satellite (Z10 ~ Z16) at the pixel ratio the MapView actually renders with.
            TilesetDescriptor satDescriptor = offlineManager.createTilesetDescriptor(
                new TilesetDescriptorOptions.Builder()
                    .styleURI(styleUri)
                    .minZoom(SAT_MIN_ZOOM)
                    .maxZoom(SAT_MAX_ZOOM)
                    .pixelRatio(pixelRatio)
                    .build()
            );
            // Descriptor 1b: the previously downloaded 1x set stays part of the region (already stored -> kept, not re-fetched).
            TilesetDescriptor satLegacyDescriptor = keepLegacy1x && Math.abs(pixelRatio - 1.0f) > 0.01f
                ? offlineManager.createTilesetDescriptor(new TilesetDescriptorOptions.Builder()
                    .styleURI(styleUri).minZoom(SAT_MIN_ZOOM).maxZoom(SAT_MAX_ZOOM).pixelRatio(1.0f).build())
                : null;

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

            List<TilesetDescriptor> descriptors = new ArrayList<>(Arrays.asList(satDescriptor, demDescriptor));
            if (satLegacyDescriptor != null) descriptors.add(satLegacyDescriptor);
            if (Math.abs(pixelRatio - 1.0f) > 0.01f) {
                // DEM at the render ratio too; if the DEM URL does not depend on the ratio this resolves to the same stored tiles.
                descriptors.add(offlineManager.createTilesetDescriptor(new TilesetDescriptorOptions.Builder()
                    .styleURI(styleUri).tilesets(Collections.singletonList(DEM_TILESET_URI))
                    .minZoom(DEM_MIN_ZOOM).maxZoom(DEM_MAX_ZOOM).pixelRatio(pixelRatio).build()));
            }
            TileRegionLoadOptions regionLoadOptions = new TileRegionLoadOptions.Builder()
                .geometry(bboxPolygon)
                .descriptors(descriptors)
                .acceptExpired(true)
                .build();
            Log.i(TAG, String.format(Locale.US, "TileRegion %s: bbox=[%.5f,%.5f,%.5f,%.5f] sat z%d-%d @%.2fx, dem z%d-%d, legacy1x=%b",
                tileRegionId, minLng, minLat, maxLng, maxLat, SAT_MIN_ZOOM, SAT_MAX_ZOOM, pixelRatio, DEM_MIN_ZOOM, DEM_MAX_ZOOM, satLegacyDescriptor != null));

            updateStatus("2/2 " + regionName + " 위성 + 3D DEM 타일 리전 다운로드 시작...");

            final DownloadReporter tileReporter = new DownloadReporter(regionId, "tiles");
            final long[] lastErrored = { 0 };
            activeTileCancelable = tileStore.loadTileRegion(
                tileRegionId,
                regionLoadOptions,
                progress -> {
                    if (generation != downloadGeneration) return;
                    long done = progress.getCompletedResourceCount();
                    long req = Math.max(1, progress.getRequiredResourceCount());
                    lastErrored[0] = progress.getErroredResourceCount();
                    tileReporter.report(done, progress.getRequiredResourceCount(), progress.getLoadedResourceSize(), lastErrored[0], done >= req);
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
                        String msg = "타일 다운로드 실패: " + (err != null ? err.getType() + " - " + err.getMessage() : "알 수 없는 오류")
                            + (lastErrored[0] > 0 ? " (실패 타일 " + lastErrored[0] + "개, 이미 저장된 타일은 유지됨)" : " (이미 저장된 타일은 유지됨)");
                        Log.w(TAG, "TileRegion " + tileRegionId + " failed: " + msg);
                        mainHandler.post(() -> { updateStatus(msg); reapplyEmbeddedNetworkBlock(); });
                        rejectDownload(call, msg);
                    } else {
                        TileRegion region = expected.getValue();
                        long count = region != null ? region.getCompletedResourceCount() : 0;
                        long required = region != null ? region.getRequiredResourceCount() : 0;
                        boolean complete = region != null && count > 0 && (required == 0 || count >= required);
                        if (!complete) {
                            String msg = String.format(
                                Locale.KOREA,
                                "타일 다운로드 미완료: %d/%d 리소스 (실패 %d개). 완료 상태로 저장하지 않습니다.",
                                count, required, lastErrored[0]
                            );
                            Log.w(TAG, "TileRegion " + tileRegionId + " incomplete: " + msg);
                            mainHandler.post(() -> { updateStatus(msg); reapplyEmbeddedNetworkBlock(); });
                            rejectDownload(call, msg);
                            return;
                        }
                        double mb = region != null ? (region.getCompletedResourceSize() / (1024.0 * 1024.0)) : 0.0;
                        String okMsg = String.format(
                            Locale.KOREA,
                            "다운로드 완료! %s 위성+3D DEM (%d 리소스, %.2f MB) 저장됨. 이제 비행기 모드에서 확인하세요.",
                            regionName, count, mb
                        );
                        final JSONObject skiOutcome = skiOutcomes.get(regionId);
                        final long mainCount = count;
                        final double mainMb = mb;
                        mainHandler.post(() -> startContextRegionDownload(call, generation, regionId, regionName, tileRegionId,
                            regionBbox, styleUri, pixelRatio, mainCount, mainMb, skiOutcome, okMsg));
                    }
                }
            );
        } catch (Throwable e) {
            String msg = "타일 리전 다운로드 설정 오류: " + e.getMessage();
            updateStatus(msg);
            reapplyEmbeddedNetworkBlock();
            rejectDownload(call, msg);
        }
    }

    /** Low-zoom ring around the region (separate TileRegion; the region's own TileRegion id is unchanged). */
    private void startContextRegionDownload(PluginCall call, long generation, String regionId, String regionName,
                                            String tileRegionId, double[] regionBbox, String styleUri, float pixelRatio,
                                            long count, double mb, JSONObject skiOutcome, String okMsg) {
        if (generation != downloadGeneration) return;
        final double[] ctx = contextBbox(regionBbox);
        try {
            TilesetDescriptor ctxSat = offlineManager.createTilesetDescriptor(new TilesetDescriptorOptions.Builder()
                .styleURI(styleUri).minZoom(CONTEXT_SAT_MIN_ZOOM).maxZoom(CONTEXT_SAT_MAX_ZOOM).pixelRatio(pixelRatio).build());
            TilesetDescriptor ctxDem = offlineManager.createTilesetDescriptor(new TilesetDescriptorOptions.Builder()
                .styleURI(styleUri).tilesets(Collections.singletonList(DEM_TILESET_URI))
                .minZoom(CONTEXT_DEM_MIN_ZOOM).maxZoom(CONTEXT_DEM_MAX_ZOOM).pixelRatio(pixelRatio).build());
            TilesetDescriptor ctxDem1x = offlineManager.createTilesetDescriptor(new TilesetDescriptorOptions.Builder()
                .styleURI(styleUri).tilesets(Collections.singletonList(DEM_TILESET_URI))
                .minZoom(CONTEXT_DEM_MIN_ZOOM).maxZoom(CONTEXT_DEM_MAX_ZOOM).pixelRatio(1.0f).build());
            TileRegionLoadOptions opts = new TileRegionLoadOptions.Builder()
                .geometry(bboxPolygon(ctx)).descriptors(Arrays.asList(ctxSat, ctxDem, ctxDem1x)).acceptExpired(true).build();
            Log.i(TAG, String.format(Locale.US, "Context TileRegion %s: bbox=[%.5f,%.5f,%.5f,%.5f] sat z%d-%d, dem z%d-%d",
                tileRegionId + CONTEXT_REGION_SUFFIX, ctx[0], ctx[1], ctx[2], ctx[3],
                CONTEXT_SAT_MIN_ZOOM, CONTEXT_SAT_MAX_ZOOM, CONTEXT_DEM_MIN_ZOOM, CONTEXT_DEM_MAX_ZOOM));
            updateStatus("2/2 " + regionName + " 주변 저배율 영상·지형 다운로드 중...");
            final DownloadReporter ctxReporter = new DownloadReporter(regionId, "context");
            activeTileCancelable = tileStore.loadTileRegion(tileRegionId + CONTEXT_REGION_SUFFIX, opts,
                progress -> {
                    if (generation != downloadGeneration) return;
                    long done = progress.getCompletedResourceCount();
                    ctxReporter.report(done, progress.getRequiredResourceCount(), progress.getLoadedResourceSize(), progress.getErroredResourceCount(),
                        done >= Math.max(1, progress.getRequiredResourceCount()));
                },
                expected -> {
                    if (generation != downloadGeneration) return;
                    boolean ctxOk = false;
                    long ctxCount = 0;
                    double ctxMb = 0;
                    if (expected.isValue() && expected.getValue() != null) {
                        TileRegion r = expected.getValue();
                        ctxCount = r.getCompletedResourceCount();
                        ctxMb = r.getCompletedResourceSize() / (1024.0 * 1024.0);
                        ctxOk = ctxCount > 0 && (r.getRequiredResourceCount() == 0 || ctxCount >= r.getRequiredResourceCount());
                    } else {
                        Log.w(TAG, "Context TileRegion failed: " + (expected.getError() != null ? expected.getError().getMessage() : "unknown"));
                    }
                    final boolean ok = ctxOk;
                    final long cc = ctxCount;
                    final double cm = ctxMb;
                    mainHandler.post(() -> finishRegionDownload(call, regionId, regionName, tileRegionId, regionBbox, styleUri,
                        pixelRatio, count, mb, skiOutcome, okMsg, ok, cc, cm));
                });
        } catch (Throwable e) {
            Log.w(TAG, "Context TileRegion setup failed: " + e.getMessage());
            finishRegionDownload(call, regionId, regionName, tileRegionId, regionBbox, styleUri, pixelRatio,
                count, mb, skiOutcome, okMsg, false, 0, 0);
        }
    }

    private void finishRegionDownload(PluginCall call, String regionId, String regionName, String tileRegionId,
                                      double[] regionBbox, String styleUri, float pixelRatio, long count, double mb,
                                      JSONObject skiOutcome, String okMsg, boolean ctxOk, long ctxCount, double ctxMb) {
        final JSONObject profile = buildDownloadProfile(styleUri, pixelRatio, regionBbox, ctxOk);
        ioExecutor.execute(() -> markTileComplete(regionId, profile));
        Log.i(TAG, String.format(Locale.US, "Download done %s: main %d res %.2f MB, context %s %d res %.2f MB, pixelRatio %.2f",
            regionId, count, mb, ctxOk ? "ok" : "INCOMPLETE", ctxCount, ctxMb, pixelRatio));
        updateStatus(skiOutcome != null ? okMsg + "\n" + skiOutcomeText(regionName, skiOutcome) : okMsg);
        reapplyEmbeddedNetworkBlock();
        if (mapView != null && regionId.equals(activeRegionId)) {
            setupMapStyleAnd3DTerrain();
            moveCameraToActiveRegion3D();
        }
        if (call != null) {
            JSObject ret = new JSObject();
            ret.put("regionId", regionId);
            ret.put("regionName", regionName);
            ret.put("tileRegionId", tileRegionId);
            ret.put("includesTerrainDemDescriptor", true);
            ret.put("complete", ctxOk);
            ret.put("completedResourceCount", count);
            ret.put("sizeMb", mb);
            ret.put("contextComplete", ctxOk);
            ret.put("contextSizeMb", ctxMb);
            ret.put("pixelRatio", pixelRatio);
            // Ski data result is separate from the tile result: tiles may be complete while ski data failed.
            ret.put("skiData", skiOutcome != null ? skiOutcome : new JSONObject());
            if (call == activeDownloadCall) activeDownloadCall = null;
            call.resolve(ret);
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
            TileRegion matchedContext = null;
            if (regions != null) {
                for (TileRegion r : regions) {
                    if ((statusTileRegionId + CONTEXT_REGION_SUFFIX).equals(r.getId())) { matchedContext = r; break; }
                }
            }
            final TileRegion foundContext = matchedContext;
            final String styleUri = !TextUtils.isEmpty(STYLE_STANDARD_SATELLITE) ? STYLE_STANDARD_SATELLITE : "mapbox://styles/mapbox/standard-satellite";
            offlineManager.getAllStylePacks(styleExpected -> {
                int styleCount = (styleExpected.isValue() && styleExpected.getValue() != null)
                    ? styleExpected.getValue().size() : 0;
                StylePack matchedStyle = null;
                if (styleExpected.isValue() && styleExpected.getValue() != null) {
                    for (StylePack pack : styleExpected.getValue()) {
                        if (styleUri.equals(pack.getStyleURI())) { matchedStyle = pack; break; }
                    }
                }
                final boolean styleOk = matchedStyle != null && (matchedStyle.getRequiredResourceCount() == 0
                    ? matchedStyle.getCompletedResourceCount() > 0
                    : matchedStyle.getCompletedResourceCount() >= matchedStyle.getRequiredResourceCount());
                final boolean tilesOk = found != null && (found.getRequiredResourceCount() == 0
                    ? found.getCompletedResourceCount() > 0
                    : found.getCompletedResourceCount() >= found.getRequiredResourceCount());
                final boolean contextOk = foundContext != null && foundContext.getCompletedResourceCount() > 0
                    && foundContext.getCompletedResourceCount() >= foundContext.getRequiredResourceCount();
                final JSONArray mismatch = downloadProfileMismatch(readRegionMeta(statusRegionId), styleUri);
                if (!contextOk && !jsonArrayContains(mismatch, "context")) mismatch.put("context");
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
                    // complete = every part needed offline is stored for THIS device/map setup.
                    boolean fullyComplete = tilesOk && styleOk && mismatch.length() == 0;
                    ret.put("complete", fullyComplete);
                    // usable = the region's own tiles + style are stored (opens offline, may show gaps).
                    ret.put("usable", tilesOk && styleOk);
                    ret.put("needsUpdate", found != null && !fullyComplete);
                    ret.put("tilesComplete", tilesOk);
                    ret.put("styleComplete", styleOk);
                    ret.put("contextComplete", contextOk);
                    try { ret.put("missing", new JSArray(mismatch.toString())); } catch (JSONException ignored) { }
                    Log.i(TAG, "Offline status " + statusRegionId + ": tiles=" + tilesOk + " style=" + styleOk
                        + " context=" + contextOk + " mismatch=" + mismatch + " complete=" + fullyComplete);
                    ret.put("hasDongtanRegion", "dongtan".equals(statusRegionId) && found != null);
                    ret.put("completedResourceCount", completed);
                    ret.put("requiredResourceCount", required);
                    ret.put("sizeBytes", found != null ? found.getCompletedResourceSize() : 0);
                    ret.put("stylePackCount", styleCount);
                    ret.put("skiData", describeSkiData(statusRegionId));
                    call.resolve(ret);
                }
            });
        });
    }

    // ---------------------------------------------------------------------
    // Ski lift/run GeoJSON: Storage download, internal storage, Mapbox line layers
    // ---------------------------------------------------------------------

    private static final class SkiDataException extends Exception {
        final String code;

        SkiDataException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private static final class SkiLayerData {
        final String text;
        final String source; // "local" | "bundled"
        final int[] counts; // {features, lifts, runs}
        final String towers; // FeatureCollection JSON
        final String terminals; // FeatureCollection JSON

        SkiLayerData(String text, String source, int[] counts) throws JSONException {
            this.text = text;
            this.source = source;
            this.counts = counts;
            String[] decorations = buildLiftDecorations(text);
            this.towers = decorations[0];
            this.terminals = decorations[1];
        }
    }

    /** UTC timestamp usable on API 24 (java.time needs API 26). */
    private static String nowIso() {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return format.format(new java.util.Date());
    }

    private File skiDir() {
        File dir = new File(getContext().getFilesDir(), SKI_DIR_NAME);
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }

    private File skiFile(String regionId) {
        return new File(skiDir(), regionId + ".geojson");
    }

    private File skiMetaFile(String regionId) {
        return new File(skiDir(), regionId + ".meta.json");
    }

    private static byte[] readLimited(InputStream in, int limit) throws IOException, SkiDataException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
            if (out.size() > limit) {
                throw new SkiDataException("too_large", "GeoJSON이 " + (limit / (1024 * 1024)) + "MB 제한을 초과했습니다.");
            }
        }
        return out.toByteArray();
    }

    private static String readFileUtf8(File file) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            return new String(readLimited(in, 32 * 1024 * 1024), StandardCharsets.UTF_8);
        } catch (SkiDataException e) {
            throw new IOException(e.getMessage());
        }
    }

    /** Writes to a temp file and renames over the target, so a failed write never damages the existing file. */
    private static void writeAtomically(File target, byte[] bytes) throws IOException {
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(bytes);
            out.getFD().sync();
        } catch (IOException e) {
            temp.delete();
            throw e;
        }
        if (!temp.renameTo(target)) {
            temp.delete();
            throw new IOException("파일 저장 실패: " + target.getName());
        }
    }

    /** Returns {featureCount, lifts, runs}; throws invalid_data unless the text is a usable FeatureCollection. */
    private static int[] validateSkiGeoJson(String text) throws SkiDataException {
        try {
            JSONObject root = new JSONObject(text);
            if (!"FeatureCollection".equals(root.optString("type"))) {
                throw new SkiDataException("invalid_data", "FeatureCollection 형식이 아닙니다.");
            }
            JSONArray features = root.optJSONArray("features");
            if (features == null) throw new SkiDataException("invalid_data", "features 배열이 없습니다.");
            int lifts = 0;
            int runs = 0;
            for (int i = 0; i < features.length(); i++) {
                JSONObject feature = features.optJSONObject(i);
                if (feature == null || feature.optJSONObject("geometry") == null) {
                    throw new SkiDataException("invalid_data", "geometry가 없는 피처가 있습니다.");
                }
                JSONObject props = feature.optJSONObject("properties");
                String type = props != null ? props.optString("powderlineType", "") : "";
                if ("lift".equals(type)) lifts++;
                else if ("run".equals(type)) runs++;
            }
            return new int[]{features.length(), lifts, runs};
        } catch (JSONException e) {
            throw new SkiDataException("invalid_data", "JSON 형식 오류: " + e.getMessage());
        }
    }

    private boolean bundledSkiExists(String regionId) {
        try (InputStream in = getContext().getAssets().open(SKI_BUNDLED_ASSET_DIR + regionId + ".geojson")) {
            return in != null;
        } catch (Exception e) {
            return false;
        }
    }

    private String readBundledSkiGeoJson(String regionId) {
        try (InputStream in = getContext().getAssets().open(SKI_BUNDLED_ASSET_DIR + regionId + ".geojson")) {
            return new String(readLimited(in, 32 * 1024 * 1024), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private byte[] downloadSkiGeoJson(String supabaseUrl, String regionId, String version)
        throws IOException, SkiDataException {
        String url = supabaseUrl + "/storage/v1/object/public/ski-data/"
            + java.net.URLEncoder.encode(regionId, "UTF-8") + ".geojson"
            + (TextUtils.isEmpty(version) ? "" : "?v=" + java.net.URLEncoder.encode(version, "UTF-8"));
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(SKI_HTTP_TIMEOUT_MS);
            conn.setReadTimeout(SKI_HTTP_TIMEOUT_MS * 2);
            conn.setRequestProperty("Accept", "application/geo+json, application/json");
            int code = conn.getResponseCode();
            if (code == 200) {
                try (InputStream in = conn.getInputStream()) {
                    return readLimited(in, SKI_MAX_BYTES);
                }
            }
            String body = "";
            try (InputStream err = conn.getErrorStream()) {
                if (err != null) body = new String(readLimited(err, 8192), StandardCharsets.UTF_8);
            } catch (SkiDataException ignored) {
            }
            // Supabase may answer a missing public object with HTTP 400 and a not_found body.
            if (code == 404 || (code == 400 && body.toLowerCase(Locale.ROOT).contains("not_found"))) {
                throw new SkiDataException("not_found", "서버에 지역 GeoJSON 파일이 없습니다 (HTTP " + code + ").");
            }
            throw new SkiDataException("http_error", "서버 응답 오류 (HTTP " + code + ").");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private JSONObject readRegionMeta(String regionId) {
        try {
            File file = skiMetaFile(regionId);
            if (!file.isFile()) return null;
            return new JSONObject(readFileUtf8(file));
        } catch (Exception e) {
            return null;
        }
    }

    private void persistRegionMeta(JSONObject meta) throws IOException, JSONException {
        writeAtomically(skiMetaFile(meta.getString("regionId")), meta.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void markTileComplete(String regionId, JSONObject downloadProfile) {
        try {
            JSONObject meta = readRegionMeta(regionId);
            if (meta == null) return;
            meta.put("tileComplete", true);
            meta.put("tileCompletedAt", nowIso());
            if (downloadProfile != null) meta.put("download", downloadProfile);
            persistRegionMeta(meta);
        } catch (Exception e) {
            Log.w(TAG, "markTileComplete failed: " + e.getMessage());
        }
    }

    /**
     * Pixel ratio the MapView renders with. MapInitOptions(context) uses the display density, and the SDK picks the
     * raster tile scale (@1x / @2x) from it, so the download must use the same value (not a fixed 1.0 or 2.0).
     */
    private float mapPixelRatio() {
        try {
            if (mapView != null) return mapView.getMapboxMap().getMapOptions().getPixelRatio();
        } catch (Throwable ignored) { }
        Context context = getContext();
        return context != null ? context.getResources().getDisplayMetrics().density : 1f;
    }

    private static double[] contextBbox(double[] bbox) {
        double padLng = Math.max(0.05, bbox[2] - bbox[0]);
        double padLat = Math.max(0.05, bbox[3] - bbox[1]);
        return new double[]{
            Math.max(-180.0, bbox[0] - padLng), Math.max(-85.0, bbox[1] - padLat),
            Math.min(180.0, bbox[2] + padLng), Math.min(85.0, bbox[3] + padLat)
        };
    }

    private static Polygon bboxPolygon(double[] b) {
        return Polygon.fromLngLats(Collections.singletonList(Arrays.asList(
            Point.fromLngLat(b[0], b[1]), Point.fromLngLat(b[2], b[1]), Point.fromLngLat(b[2], b[3]),
            Point.fromLngLat(b[0], b[3]), Point.fromLngLat(b[0], b[1]))));
    }

    private JSONObject buildDownloadProfile(String styleUri, float pixelRatio, double[] bbox, boolean contextComplete) {
        JSONObject p = new JSONObject();
        try {
            p.put("version", DOWNLOAD_PROFILE_VERSION);
            p.put("styleUri", styleUri);
            p.put("pixelRatio", pixelRatio);
            p.put("satMinZoom", SAT_MIN_ZOOM); p.put("satMaxZoom", SAT_MAX_ZOOM);
            p.put("demMinZoom", DEM_MIN_ZOOM); p.put("demMaxZoom", DEM_MAX_ZOOM);
            p.put("contextSatZoom", CONTEXT_SAT_MIN_ZOOM + "-" + CONTEXT_SAT_MAX_ZOOM);
            p.put("contextDemZoom", CONTEXT_DEM_MIN_ZOOM + "-" + CONTEXT_DEM_MAX_ZOOM);
            p.put("bbox", new JSONArray().put(bbox[0]).put(bbox[1]).put(bbox[2]).put(bbox[3]));
            p.put("contextComplete", contextComplete);
            p.put("savedAt", nowIso());
        } catch (JSONException ignored) { }
        return p;
    }

    /** Reasons why saved data does not match what the map needs now (empty = matches). */
    private JSONArray downloadProfileMismatch(JSONObject meta, String styleUri) {
        JSONArray reasons = new JSONArray();
        JSONObject p = meta != null ? meta.optJSONObject("download") : null;
        if (p == null || p.optInt("version", 0) < DOWNLOAD_PROFILE_VERSION) { reasons.put("profile_missing"); return reasons; }
        if (!styleUri.equals(p.optString("styleUri"))) reasons.put("style");
        if (Math.abs(p.optDouble("pixelRatio", 1.0) - mapPixelRatio()) > 0.01) reasons.put("pixel_ratio");
        if (p.optInt("satMinZoom") != SAT_MIN_ZOOM || p.optInt("satMaxZoom") != SAT_MAX_ZOOM
            || p.optInt("demMinZoom") != DEM_MIN_ZOOM || p.optInt("demMaxZoom") != DEM_MAX_ZOOM) reasons.put("zoom");
        if (!p.optBoolean("contextComplete", false)) reasons.put("context");
        return reasons;
    }

    /** A download needs the network; once it ends, an open offline map goes back to local-only. */
    private static boolean jsonArrayContains(JSONArray arr, String value) {
        for (int i = 0; i < arr.length(); i++) if (value.equals(arr.optString(i))) return true;
        return false;
    }

    private void reapplyEmbeddedNetworkBlock() {
        if (embeddedContainer != null) setEmbeddedNetworkBlocked(true);
    }

    /** While the offline map is open, the Mapbox stack must not silently fill gaps from the network. */
    private void setEmbeddedNetworkBlocked(boolean blocked) {
        if (mapboxOfflineForced == blocked) return;
        mapboxOfflineForced = blocked;
        try { OfflineSwitch.getInstance().setMapboxStackConnected(!blocked); } catch (Throwable ignored) { }
        Log.i(TAG, "Mapbox network " + (blocked ? "BLOCKED (offline map uses only local TileStore/StylePack)" : "restored"));
    }

    /**
     * Downloads {regionId}.geojson from the public ski-data bucket and stores it in app internal storage.
     * Any failure keeps the previously saved file. Region id/name/center/bbox are saved next to it so the region
     * can be re-opened offline. Returns the outcome of this attempt (never throws).
     */
    private JSONObject fetchAndStoreSkiData(
        String regionId,
        String regionName,
        double[] center,
        double[] bbox,
        String tileRegionId,
        String dbStatus,
        String version,
        String supabaseUrl
    ) {
        JSONObject outcome = new JSONObject();
        final String now = nowIso();
        final String status = dbStatus == null ? "" : dbStatus.trim().toLowerCase(Locale.ROOT);
        final boolean hasLocal = skiFile(regionId).isFile();
        final boolean hasBundled = bundledSkiExists(regionId);
        String failCode = null;
        String failMessage = null;
        boolean saved = false;
        int[] counts = null;
        long bytes = 0;

        // Storage is only queried when the registry says the file is ready (or the status is unknown).
        if ("ready".equals(status) || status.isEmpty()) {
            try {
                byte[] body = downloadSkiGeoJson(supabaseUrl, regionId, version);
                counts = validateSkiGeoJson(new String(body, StandardCharsets.UTF_8));
                writeAtomically(skiFile(regionId), body);
                bytes = body.length;
                saved = true;
            } catch (SkiDataException e) {
                failCode = e.code;
                failMessage = e.getMessage();
            } catch (IOException e) {
                failCode = "network_error";
                failMessage = "네트워크/저장 오류: " + e.getMessage();
            } catch (Throwable e) {
                failCode = "unknown_error";
                failMessage = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
        } else if ("empty".equals(status)) {
            failCode = "empty";
        } else if ("pending".equals(status) || "processing".equals(status)) {
            failCode = "pending";
        } else if ("failed".equals(status)) {
            failCode = "source_failed";
            failMessage = "서버의 데이터 수집이 실패한 지역입니다.";
        } else {
            failCode = "not_requested";
        }

        try {
            if (saved) {
                outcome.put("status", "saved");
                outcome.put("source", "local");
                outcome.put("keptExisting", false);
                outcome.put("featureCount", counts[0]);
                outcome.put("lifts", counts[1]);
                outcome.put("runs", counts[2]);
                outcome.put("bytes", bytes);
                outcome.put("version", version == null ? "" : version);
                outcome.put("savedAt", now);
            } else {
                outcome.put("status", failCode);
                outcome.put("source", hasLocal ? "local" : (hasBundled ? "bundled" : "none"));
                outcome.put("keptExisting", hasLocal);
                if (failMessage != null) outcome.put("error", failMessage);
            }
        } catch (JSONException ignored) {
        }

        // Region metadata for offline re-entry. A failed attempt never overwrites the last good ski data block.
        try {
            JSONObject meta = readRegionMeta(regionId);
            if (meta == null) meta = new JSONObject();
            meta.put("regionId", regionId);
            meta.put("regionName", regionName);
            meta.put("center", new JSONArray().put(center[0]).put(center[1]));
            meta.put("bbox", new JSONArray().put(bbox[0]).put(bbox[1]).put(bbox[2]).put(bbox[3]));
            meta.put("tileRegionId", tileRegionId);
            meta.put("updatedAt", now);
            JSONObject previousSki = meta.optJSONObject("skiData");
            if (saved || previousSki == null || !hasLocal) {
                meta.put("skiData", new JSONObject(outcome.toString()));
            } else {
                JSONObject attempt = new JSONObject(outcome.toString());
                attempt.put("at", now);
                previousSki.put("lastAttempt", attempt);
            }
            persistRegionMeta(meta);
        } catch (Exception e) {
            Log.w(TAG, "region metadata save failed: " + e.getMessage());
            try {
                outcome.put("metaError", e.getMessage());
            } catch (JSONException ignored) {
            }
        }
        return outcome;
    }

    private static String skiStatusLabel(String status) {
        switch (status == null ? "" : status) {
            case "saved": return "저장됨";
            case "empty": return "리프트·슬로프 데이터 없음";
            case "pending": return "서버 데이터 준비 중";
            case "source_failed": return "서버 데이터 수집 실패";
            case "not_found": return "서버에 파일 없음";
            case "network_error": return "네트워크 오류";
            case "invalid_data": return "데이터 형식 오류";
            case "too_large": return "용량 초과";
            case "http_error": return "서버 응답 오류";
            case "not_requested": return "데이터 요청 없음";
            default: return TextUtils.isEmpty(status) ? "알 수 없음" : status;
        }
    }

    private static String skiOutcomeText(String regionName, JSONObject outcome) {
        String status = outcome.optString("status", "");
        StringBuilder text = new StringBuilder("스키 데이터(").append(regionName).append("): ");
        if ("saved".equals(status)) {
            text.append(String.format(Locale.KOREA, "저장 완료 — 리프트 %d, 슬로프 %d (%.1f KB)",
                outcome.optInt("lifts"), outcome.optInt("runs"), outcome.optLong("bytes") / 1024.0));
        } else {
            text.append(skiStatusLabel(status));
            if (outcome.optBoolean("keptExisting")) text.append(" · 기존 로컬 파일 유지");
            else if ("bundled".equals(outcome.optString("source"))) text.append(" · 내장 데이터 사용");
        }
        return text.toString();
    }

    /** Describes ski data availability on this device (used by getOfflineStatus / listOfflineRegions). */
    private JSObject describeSkiData(String regionId) {
        JSObject out = new JSObject();
        boolean hasLocal = skiFile(regionId).isFile();
        boolean hasBundled = bundledSkiExists(regionId);
        out.put("hasLocalFile", hasLocal);
        out.put("hasBundledFallback", hasBundled);
        out.put("source", hasLocal ? "local" : (hasBundled ? "bundled" : "none"));
        JSONObject meta = readRegionMeta(regionId);
        out.put("regionSaved", meta != null);
        if (meta != null) {
            out.put("tileComplete", meta.optBoolean("tileComplete", false));
            // BBox the saved tiles/ski data were downloaded for (JS compares it with the current registry BBox).
            out.put("savedBbox", meta.optJSONArray("bbox"));
            JSONObject ski = meta.optJSONObject("skiData");
            if (ski != null) {
                Iterator<String> keys = ski.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    if (!"source".equals(key)) out.put(key, ski.opt(key));
                }
            }
        }
        return out;
    }

    private SkiLayerData loadSkiLayerData(String regionId) {
        File file = skiFile(regionId);
        if (file.isFile()) {
            try {
                String text = readFileUtf8(file);
                return new SkiLayerData(text, "local", validateSkiGeoJson(text));
            } catch (Exception e) {
                Log.w(TAG, "local ski data unusable (" + regionId + "): " + e.getMessage());
            }
        }
        String bundled = readBundledSkiGeoJson(regionId);
        if (bundled != null) {
            try {
                return new SkiLayerData(bundled, "bundled", validateSkiGeoJson(bundled));
            } catch (Exception e) {
                Log.w(TAG, "bundled ski data unusable (" + regionId + "): " + e.getMessage());
            }
        }
        return null;
    }

    /** Reads local (or bundled fallback) GeoJSON off the main thread, then adds the line layers to the style. */
    private void addSkiOverlay(@NonNull Style style) {
        final String regionId = activeRegionId;
        ioExecutor.execute(() -> {
            final SkiLayerData data = loadSkiLayerData(regionId);
            mainHandler.post(() -> {
                if (mapView == null || !regionId.equals(activeRegionId)) return;
                if (data == null) {
                    JSONObject meta = readRegionMeta(regionId);
                    JSONObject ski = meta != null ? meta.optJSONObject("skiData") : null;
                    skiOverlayLabel = "스키 데이터 없음" + (ski != null ? " (" + skiStatusLabel(ski.optString("status")) + ")" : "");
                } else {
                    try {
                        applySkiLayers(style, data);
                        skiOverlayLabel = String.format(Locale.KOREA, "스키 데이터(%s): 리프트 %d · 슬로프 %d",
                            "local".equals(data.source) ? "저장본" : "내장", data.counts[1], data.counts[2]);
                    } catch (Throwable e) {
                        Log.e(TAG, "ski overlay failed", e);
                        skiOverlayLabel = "스키 데이터 표시 실패: " + e.getMessage();
                    }
                }
                updateBboxSummaryText();
            });
        });
    }

    // Layer definitions mirror addSkiLayers() in dist/app.js (online map, same Mapbox Standard Satellite style):
    // no slot / emissive-strength (the web map sets neither), runs by difficulty, dark-cased orange solid lifts,
    // towers (z>=14.5) and boarding/drop-off terminals. Values are kept identical to the web definitions.
    private static final String SKI_RUNS_LAYER = "{\"id\":\"powderline-ski-runs\",\"type\":\"line\",\"source\":\"" + SKI_SOURCE_ID + "\","
        + "\"filter\":[\"==\",[\"get\",\"powderlineType\"],\"run\"],"
        + "\"paint\":{\"line-color\":[\"match\",[\"get\",\"difficulty\"],\"novice\",\"#54b948\",\"easy\",\"#54b948\","
        + "\"intermediate\",\"#2788d3\",\"advanced\",\"#e74b3c\",\"expert\",\"#202725\",\"freeride\",\"#b14bd1\",\"#2788d3\"],"
        + "\"line-width\":[\"interpolate\",[\"linear\"],[\"zoom\"],9,0.8,12,1.2,15,2.0],\"line-opacity\":0.65}}";
    private static final String SKI_LIFTS_LAYER = "{\"id\":\"powderline-ski-lifts\",\"type\":\"line\",\"source\":\"" + SKI_SOURCE_ID + "\","
        + "\"filter\":[\"==\",[\"get\",\"powderlineType\"],\"lift\"],"
        + "\"paint\":{\"line-color\":\"#2563eb\",\"line-width\":[\"interpolate\",[\"linear\"],[\"zoom\"],9,0.6,12,0.9,15,1.5],"
        + "\"line-dasharray\":[4,3],\"line-opacity\":1.0}}";
    private static final String ROUTE_GLOW_LAYER = "{\"id\":\"" + ROUTE_GLOW_LAYER_ID + "\",\"type\":\"line\",\"source\":\"" + ROUTE_SOURCE_ID + "\","
        + "\"paint\":{\"line-color\":[\"coalesce\",[\"get\",\"glowColor\"],\"#14211f\"],"
        + "\"line-width\":[\"case\",[\"==\",[\"get\",\"selected\"],true],8,6],\"line-opacity\":0.35,\"line-blur\":2}}";
    private static final String ROUTE_LINE_LAYER = "{\"id\":\"" + ROUTE_LINE_LAYER_ID + "\",\"type\":\"line\",\"source\":\"" + ROUTE_SOURCE_ID + "\","
        + "\"paint\":{\"line-color\":[\"coalesce\",[\"get\",\"color\"],\"#ff0000\"],"
        + "\"line-width\":[\"case\",[\"==\",[\"get\",\"selected\"],true],4,3],\"line-opacity\":1}}";
    private static final String CURSOR_LAYER = "{\"id\":\"" + CURSOR_LAYER_ID + "\",\"type\":\"symbol\",\"source\":\"" + CURSOR_SOURCE_ID + "\","
        + "\"layout\":{\"icon-image\":\"" + CURSOR_IMAGE_ID + "\",\"icon-allow-overlap\":true,\"icon-ignore-placement\":true}}";
    private static final String SKI_TERMINALS_LAYER = "{\"id\":\"powderline-ski-lift-terminals\",\"type\":\"circle\",\"source\":\"" + SKI_TERMINALS_SOURCE_ID + "\","
        + "\"minzoom\":10.0,\"paint\":{\"circle-radius\":[\"interpolate\",[\"linear\"],[\"zoom\"],10,2.5,13,4,16,6],"
        + "\"circle-color\":[\"match\",[\"get\",\"role\"],\"dropoff\",\"#dc2626\",\"#16a34a\"],"
        + "\"circle-stroke-color\":\"#ffffff\",\"circle-stroke-width\":1.5}}";

    /** Same approximation as horizontalMeters() in dist/app.js, so towers land on the same spots. */
    private static double horizontalMeters(double lng1, double lat1, double lng2, double lat2) {
        double r = Math.PI / 180.0;
        double x = (lng2 - lng1) * r * Math.cos((lat1 + lat2) * r / 2.0);
        double y = (lat2 - lat1) * r;
        return 6371000.0 * Math.sqrt(x * x + y * y);
    }

    private static JSONObject pointFeature(double lng, double lat, JSONObject properties) throws JSONException {
        return new JSONObject()
            .put("type", "Feature")
            .put("geometry", new JSONObject().put("type", "Point").put("coordinates", new JSONArray().put(lng).put(lat)))
            .put("properties", properties);
    }

    /** Port of buildLiftDecorations() in dist/app.js: terminals at both ends, towers every ~220 m (45 m margin). */
    private static String[] buildLiftDecorations(String geoJsonText) throws JSONException {
        JSONArray towers = new JSONArray();
        JSONArray terminals = new JSONArray();
        JSONArray features = new JSONObject(geoJsonText).optJSONArray("features");
        for (int i = 0; features != null && i < features.length(); i++) {
            JSONObject feature = features.optJSONObject(i);
            JSONObject props = feature != null ? feature.optJSONObject("properties") : null;
            JSONObject geometry = feature != null ? feature.optJSONObject("geometry") : null;
            if (props == null || geometry == null || !"lift".equals(props.optString("powderlineType"))) continue;
            JSONArray lines;
            if ("LineString".equals(geometry.optString("type"))) lines = new JSONArray().put(geometry.optJSONArray("coordinates"));
            else if ("MultiLineString".equals(geometry.optString("type"))) lines = geometry.optJSONArray("coordinates");
            else continue;
            String liftId = props.optString("id", "");
            for (int l = 0; lines != null && l < lines.length(); l++) {
                JSONArray line = lines.optJSONArray(l);
                if (line == null || line.length() < 2) continue;
                JSONArray first = line.getJSONArray(0);
                JSONArray last = line.getJSONArray(line.length() - 1);
                terminals.put(pointFeature(first.getDouble(0), first.getDouble(1), new JSONObject().put("liftId", liftId).put("role", "boarding")));
                terminals.put(pointFeature(last.getDouble(0), last.getDouble(1), new JSONObject().put("liftId", liftId).put("role", "dropoff")));

                double[] segDists = new double[line.length() - 1];
                double totalDist = 0;
                for (int p = 1; p < line.length(); p++) {
                    JSONArray a = line.getJSONArray(p - 1);
                    JSONArray b = line.getJSONArray(p);
                    segDists[p - 1] = horizontalMeters(a.getDouble(0), a.getDouble(1), b.getDouble(0), b.getDouble(1));
                    totalDist += segDists[p - 1];
                }
                int count = (int) Math.floor(totalDist / 220.0);
                if (count <= 0 || totalDist <= 200) continue;
                for (int k = 1; k <= count; k++) {
                    double target = k * (totalDist / (count + 1));
                    if (target < 45 || target > totalDist - 45) continue;
                    double accum = 0;
                    for (int s = 0; s < segDists.length; s++) {
                        if (accum + segDists[s] >= target) {
                            double ratio = segDists[s] > 0 ? (target - accum) / segDists[s] : 0;
                            JSONArray a = line.getJSONArray(s);
                            JSONArray b = line.getJSONArray(s + 1);
                            double lng = a.getDouble(0) + (b.getDouble(0) - a.getDouble(0)) * ratio;
                            double lat = a.getDouble(1) + (b.getDouble(1) - a.getDouble(1)) * ratio;
                            towers.put(pointFeature(lng, lat, new JSONObject().put("liftId", liftId).put("towerNum", k)));
                            break;
                        }
                        accum += segDists[s];
                    }
                }
            }
        }
        return new String[]{
            new JSONObject().put("type", "FeatureCollection").put("features", towers).toString(),
            new JSONObject().put("type", "FeatureCollection").put("features", terminals).toString()
        };
    }

    private static void addGeoJsonSource(@NonNull Style style, String sourceId, String dataJson) {
        Expected<String, Value> source = Value.fromJson("{\"type\":\"geojson\",\"data\":" + dataJson + "}");
        if (source.isError() || source.getValue() == null) {
            throw new IllegalStateException("GeoJSON 소스 생성 실패(" + sourceId + "): " + source.getError());
        }
        Expected<String, com.mapbox.bindgen.None> added = style.addStyleSource(sourceId, source.getValue());
        if (added.isError()) throw new IllegalStateException("GeoJSON 소스 추가 실패(" + sourceId + "): " + added.getError());
    }

    private void applySkiLayers(@NonNull Style style, SkiLayerData data) {
        for (String layerId : SKI_LAYER_IDS) {
            if (style.styleLayerExists(layerId)) style.removeStyleLayer(layerId);
        }
        for (String sourceId : new String[]{SKI_SOURCE_ID, SKI_TOWERS_SOURCE_ID, SKI_TERMINALS_SOURCE_ID}) {
            if (style.styleSourceExists(sourceId)) style.removeStyleSource(sourceId);
        }
        addGeoJsonSource(style, SKI_SOURCE_ID, data.text);
        addGeoJsonSource(style, SKI_TOWERS_SOURCE_ID, data.towers);
        addGeoJsonSource(style, SKI_TERMINALS_SOURCE_ID, data.terminals);
        // Same order as the web map: runs, lift line, terminals.
        addSkiLayer(style, SKI_RUNS_LAYER);
        addSkiLayer(style, SKI_LIFTS_LAYER);
        addSkiLayer(style, SKI_TERMINALS_LAYER);
        ensureEmbeddedOverlays(style); // route + selected-point marker stay above the ski layers
    }

    private String cursorGeoJson() {
        if (embeddedCursor == null) return "{\"type\":\"FeatureCollection\",\"features\":[]}";
        return "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"properties\":{},\"geometry\":{\"type\":\"Point\",\"coordinates\":["
            + embeddedCursor[0] + "," + embeddedCursor[1] + "]}}]}";
    }

    /** Small yellow cross (same look as the web marker) as a style image. */
    private void addCursorImage(@NonNull Style style) {
        if (style.hasStyleImage(CURSOR_IMAGE_ID)) return;
        final int size = 36;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStrokeCap(Paint.Cap.ROUND);
        float a = 5f, b = size - 5f, m = size / 2f;
        p.setColor(Color.parseColor("#0F172A"));
        p.setStrokeWidth(9f);
        canvas.drawLine(m, a, m, b, p);
        canvas.drawLine(a, m, b, m, p);
        p.setColor(Color.parseColor("#FACC15"));
        p.setStrokeWidth(5f);
        canvas.drawLine(m, a, m, b, p);
        canvas.drawLine(a, m, b, m, p);
        ByteBuffer buffer = ByteBuffer.allocateDirect(bmp.getByteCount());
        bmp.copyPixelsToBuffer(buffer);
        buffer.rewind();
        Image image = new Image(size, size, new DataRef(buffer));
        Expected<String, com.mapbox.bindgen.None> res = style.addStyleImage(
            CURSOR_IMAGE_ID, 2.0f, image, false, new ArrayList<ImageStretches>(), new ArrayList<ImageStretches>(), (ImageContent) null);
        if (res.isError()) Log.w(TAG, "cursor image error: " + res.getError());
        bmp.recycle();
    }

    /** (Re)adds the GPX route + selected-point marker layers on top of everything. */
    private void ensureEmbeddedOverlays(@NonNull Style style) {
        try {
            for (String id : new String[]{CURSOR_LAYER_ID, ROUTE_LINE_LAYER_ID, ROUTE_GLOW_LAYER_ID}) {
                if (style.styleLayerExists(id)) style.removeStyleLayer(id);
            }
            for (String id : new String[]{CURSOR_SOURCE_ID, ROUTE_SOURCE_ID}) {
                if (style.styleSourceExists(id)) style.removeStyleSource(id);
            }
            addGeoJsonSource(style, ROUTE_SOURCE_ID, embeddedRouteJson);
            addSkiLayer(style, ROUTE_GLOW_LAYER);
            addSkiLayer(style, ROUTE_LINE_LAYER);
            addCursorImage(style);
            addGeoJsonSource(style, CURSOR_SOURCE_ID, cursorGeoJson());
            addSkiLayer(style, CURSOR_LAYER);
        } catch (Throwable e) {
            Log.w(TAG, "route overlay failed: " + e.getMessage());
        }
    }

    private void setSourceData(String sourceId, String json) {
        if (mapView == null) return;
        try {
            Style style = mapView.getMapboxMap().getStyle();
            if (style == null || !style.styleSourceExists(sourceId)) return;
            Expected<String, Value> data = Value.fromJson(json);
            if (data.isValue() && data.getValue() != null) style.setStyleSourceProperty(sourceId, "data", data.getValue());
        } catch (Throwable e) {
            Log.w(TAG, "setSourceData(" + sourceId + ") failed: " + e.getMessage());
        }
    }

    private void addSkiLayer(@NonNull Style style, String layerJson) {
        Expected<String, Value> value = Value.fromJson(layerJson);
        if (value.isError() || value.getValue() == null) {
            throw new IllegalStateException("레이어 정의 오류: " + value.getError());
        }
        Expected<String, com.mapbox.bindgen.None> result = style.addStyleLayer(value.getValue(), (LayerPosition) null);
        if (result.isError()) throw new IllegalStateException("레이어 추가 실패: " + result.getError());
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
        gpsFollowActive = true;
        gpsDragging = false;
        gpsRecenterNext = true;
        if (lastKnownGpsFix != null) {
            followGpsIfNeeded(lastKnownGpsFix, true);
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

    /** Keeps zoom/pitch/bearing; moves only the center (marker ~10% below screen center) when it leaves the safe area. */
    private void followGpsIfNeeded(Location loc, boolean force) {
        if (mapView == null || loc == null || !gpsFollowActive || gpsDragging) return;
        if (gpsRecenterNext) { force = true; gpsRecenterNext = false; }
        if (!force && loc.hasAccuracy() && loc.getAccuracy() > 60f) return; // low-quality fixes never move the camera
        try {
            int w = mapView.getWidth();
            int h = mapView.getHeight();
            if (w <= 0 || h <= 0) return;
            Point p = Point.fromLngLat(loc.getLongitude(), loc.getLatitude());
            if (!force) {
                ScreenCoordinate sc = mapView.getMapboxMap().pixelForCoordinate(p);
                if (sc.getX() >= w * 0.25 && sc.getX() <= w * 0.75 && sc.getY() >= h * 0.45 && sc.getY() <= h * 0.75) return;
            }
            CameraOptions target = new CameraOptions.Builder()
                .center(p)
                .padding(new EdgeInsets(h * 0.2, 0.0, 0.0, 0.0))
                .build();
            CameraAnimationsUtils.getCamera(mapView).easeTo(target, new MapAnimationOptions.Builder().duration(700L).build(), null);
        } catch (Throwable e) {
            Log.w(TAG, "GPS follow warning: " + e.getMessage());
        }
    }

    private void stopGpsFollow() {
        gpsFollowActive = false;
    }

    private void hookGpsFollowGestures() {
        if (gpsGesturesHooked || mapView == null) return;
        GesturesPlugin gestures = GesturesUtils.getGestures(mapView);
        // Pan handler also reports 2-finger movement during a pinch: judge at the end of the gesture.
        gestures.addOnMoveListener(new OnMoveListener() {
            @Override public void onMoveBegin(@NonNull MoveGestureDetector detector) {
                gpsDragging = true;
                gpsDragMaxPointers = detector.getPointersCount();
                gpsDragZoom = (float) mapView.getMapboxMap().getCameraState().getZoom();
            }
            @Override public boolean onMove(@NonNull MoveGestureDetector detector) {
                gpsDragMaxPointers = Math.max(gpsDragMaxPointers, detector.getPointersCount());
                return false;
            }
            @Override public void onMoveEnd(@NonNull MoveGestureDetector detector) {
                gpsDragging = false;
                float zoomNow = mapView != null ? (float) mapView.getMapboxMap().getCameraState().getZoom() : gpsDragZoom;
                boolean pinch = gpsDragMaxPointers > 1 || Math.abs(zoomNow - gpsDragZoom) > 0.01f;
                if (!pinch) stopGpsFollow();
            }
        });
        // Rotation and tilt (and pinch zoom) never end follow.
        gestures.addOnRotateListener(new OnRotateListener() {
            @Override public void onRotateBegin(@NonNull RotateGestureDetector detector) {}
            @Override public void onRotate(@NonNull RotateGestureDetector detector) {}
            @Override public void onRotateEnd(@NonNull RotateGestureDetector detector) {}
        });
        gestures.addOnShoveListener(new OnShoveListener() {
            @Override public void onShoveBegin(@NonNull ShoveGestureDetector detector) {}
            @Override public void onShove(@NonNull ShoveGestureDetector detector) {}
            @Override public void onShoveEnd(@NonNull ShoveGestureDetector detector) {}
        });
        gpsGesturesHooked = true;
    }

    @SuppressWarnings("MissingPermission")
    /**
     * My-location marker drawn exactly like the online map (mapbox-gl v2.2 GeolocateControl, dp = CSS px):
     * dot r=7.5 #1DA1F2, 2dp white ring (r=9.5) with a 3dp soft shadow, and the heading arrowhead #4AA1EB
     * (apex 21.9dp above the centre, outer corners +-7.5dp at 11.6dp, notch at 14.4dp) that rotates with the compass.
     * Returns null on any error so the caller keeps the SDK default puck.
     */
    @Nullable
    private LocationPuck2D buildWebStyleLocationPuck(@NonNull Activity activity) {
        try {
            final float d = activity.getResources().getDisplayMetrics().density;
            final int topSize = Math.round(26f * d);
            Bitmap top = Bitmap.createBitmap(topSize, topSize, Bitmap.Config.ARGB_8888);
            Canvas tc = new Canvas(top);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            float c = topSize / 2f;
            p.setColor(Color.WHITE);
            p.setShadowLayer(3f * d / 2f, 0f, 0f, Color.argb(0x59, 0, 0, 0));
            tc.drawCircle(c, c, 9.5f * d, p);
            p.clearShadowLayer();
            p.setColor(Color.parseColor("#1DA1F2"));
            tc.drawCircle(c, c, 7.5f * d, p);

            final int bearingSize = Math.round(48f * d);
            Bitmap bearing = Bitmap.createBitmap(bearingSize, bearingSize, Bitmap.Config.ARGB_8888);
            Canvas bc = new Canvas(bearing);
            float bcx = bearingSize / 2f;
            Path arrow = new Path();
            arrow.moveTo(bcx, bcx - 21.9f * d);
            arrow.lineTo(bcx + 7.5f * d, bcx - 11.6f * d);
            arrow.lineTo(bcx, bcx - 14.4f * d);
            arrow.lineTo(bcx - 7.5f * d, bcx - 11.6f * d);
            arrow.close();
            Paint ap = new Paint(Paint.ANTI_ALIAS_FLAG);
            ap.setStyle(Paint.Style.FILL);
            ap.setColor(Color.parseColor("#4AA1EB"));
            bc.drawPath(arrow, ap);

            return new LocationPuck2D(ImageHolder.from(top), ImageHolder.from(bearing), null, null, 1.0f);
        } catch (Throwable e) {
            Log.w(TAG, "web-style puck failed, using default: " + e.getMessage());
            return null;
        }
    }

    private void enableLocationComponentIfPermitted() {
        Activity activity = getActivity();
        if (activity == null || !hasLocationPermission(activity)) return;

        if (mapView != null) {
            try {
                LocationComponentPlugin locPlugin = LocationComponentUtils.getLocationComponent(mapView);
                locPlugin.setEnabled(true);
                // Same marker as the online (web mapbox-gl GeolocateControl) map; falls back to the SDK default puck.
                LocationPuck2D webPuck = buildWebStyleLocationPuck(activity);
                locPlugin.setLocationPuck(webPuck != null ? webPuck : LocationComponentUtils.createDefault2DPuck(true));
                try {
                    locPlugin.setShowAccuracyRing(true); // web: .mapboxgl-user-location-accuracy-circle (#1da1f2 @ 20%)
                    locPlugin.setAccuracyRingColor(Color.argb(0x33, 0x1D, 0xA1, 0xF2));
                    locPlugin.setAccuracyRingBorderColor(Color.TRANSPARENT);
                } catch (Throwable ringError) {
                    Log.w(TAG, "accuracy ring settings warning: " + ringError.getMessage());
                }
                // Phone compass heading (sensor only, works offline); never replaced by GPS course.
                locPlugin.setPuckBearingEnabled(true);
                locPlugin.setPuckBearing(PuckBearing.HEADING);
                hookGpsFollowGestures();
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
                        mainHandler.post(() -> followGpsIfNeeded(location, false));
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
            "%s (%s) | 출처: %s | BBox: [%.4f, %.4f ~ %.4f, %.4f] | 위성 Z%d~Z%d, 3D DEM Z%d~Z%d | %s",
            activeRegionName,
            activeRegionId,
            activeBboxSource,
            activeBbox[0], activeBbox[1], activeBbox[2], activeBbox[3],
            SAT_MIN_ZOOM, SAT_MAX_ZOOM, DEM_MIN_ZOOM, DEM_MAX_ZOOM,
            skiOverlayLabel
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

    /**
     * Download progress for the WebView (event "offlineDownloadProgress"), at most ~2 per second per phase.
     * phase: style | tiles | context. done/required are TileStore's own resource counts, so percent matches what is stored.
     */
    private final class DownloadReporter {
        private final String regionId;
        private final String phase;
        private final String jobId = activeDownloadJobId;
        private long lastEmitMs = 0;
        private long sampleMs = 0;
        private long sampleDone = 0;
        private double rate = 0; // resources per second, smoothed over ~10 s windows

        DownloadReporter(String regionId, String phase) {
            this.regionId = regionId;
            this.phase = phase;
        }

        synchronized void report(long done, long required, long networkBytes, long errored, boolean force) {
            long now = System.currentTimeMillis();
            if (sampleMs == 0) {
                sampleMs = now;
                sampleDone = done;
            } else if (now - sampleMs >= 10000) {
                double inst = Math.max(0, done - sampleDone) * 1000.0 / (now - sampleMs);
                rate = rate == 0 ? inst : rate * 0.6 + inst * 0.4;
                sampleMs = now;
                sampleDone = done;
            }
            if (!force && now - lastEmitMs < 500) return;
            lastEmitMs = now;
            JSObject o = new JSObject();
            o.put("regionId", regionId);
            o.put("jobId", jobId);
            o.put("phase", phase);
            o.put("done", done);
            o.put("required", required);
            o.put("percent", required > 0 ? Math.min(100.0, done * 100.0 / required) : -1);
            o.put("mb", networkBytes / (1024.0 * 1024.0));
            o.put("errored", errored);
            o.put("etaSec", rate > 0 && required > done ? Math.round((required - done) / rate) : -1);
            mainHandler.post(() -> notifyListeners("offlineDownloadProgress", o));
        }
    }

    /** Cancels the running download and rejects its pending call (nothing is left waiting forever). */
    private void cancelActiveDownloads() {
        cancelDownloadWork();
        PluginCall pending = activeDownloadCall;
        activeDownloadCall = null;
        if (pending != null) pending.reject("다운로드가 취소되었습니다.", "CANCELLED");
    }

    private void cancelDownloadWork() {
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
            gpsGesturesHooked = false;
            gpsFollowActive = false;
            gpsDragging = false;
            gpsRecenterNext = false;
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

