; (async () => {
  const regions = {
    asahidake: { label: '아사히다케', center: [142.854, 43.663], zoom: 11.0, bearing: 12, pitch: 54 },
    rusutsu: { label: '루스츠', center: [140.88, 42.74], zoom: 11.0, bearing: -18, pitch: 54 },
    furano: { label: '후라노', center: [142.355, 43.325], zoom: 11.0, bearing: 16, pitch: 54 },
    niseko: { label: '니세코', center: [140.69, 42.86], zoom: 10.5, bearing: -20, pitch: 54 },
    kamui: { label: '카무이 스키 링크스', center: [142.19, 43.70], zoom: 11.0, bearing: 8, pitch: 54 },
    kiroro: { label: '키로로', center: [140.99, 43.07], zoom: 10.8, bearing: -12, pitch: 54 }
  };
  const I18N = {
    ko: {
      docTitle: 'POWDERLINE — 백컨트리 경로 설계',
      brandSubtitle: '백컨트리 경로 설계',
      labelRegion: '지역',
      labelMapStyle: '지도 종류',
      btnSatellite: '위성 지도',
      btnTopo: '지형도 / 등고선',
      legendLayers: '표시 설정',
      layerLifts: '리프트',
      layerRuns: '슬로프',
      layerGpx: '내 GPX 경로',
      btnCreateCourse: '코스 만들기',
      btnFinishDrawing: '그리기 완료',
      editorTitle: '코스 편집 모드',
      editorStatusDefault: '도구를 선택하세요.',
      btnClose: '닫기',
      labelCourseName: '코스 이름',
      placeholderCourseName: '코스 이름',
      btnNewCourse: '＋ 새 코스',
      btnFinishDraw: '그리기 완료',
      toolDraw: '그리기',
      toolEdit: '꼭짓점 편집',
      toolCut: '✂ 코스 자르기',
      toolDeleteSegment: '구간 삭제',
      btnUndo: '실행 취소',
      btnRedo: '다시 실행',
      btnDeleteVertex: '선택 꼭짓점 삭제',
      btnClearCourse: '선택 코스 비우기',
      labelWorkingCourses: '작업 중인 코스',
      btnSaveCourse: '선택 코스 저장',
      btnImportGpx: 'GPX 불러오기',
      btnExportGpx: 'GPX 내보내기',
      statDistance: '거리',
      statPoints: '꼭짓점',
      statDescent: '누적 하강*',
      hint3D: '* 3D 지형의 실제 고도 데이터를 사용합니다. 경로는 GPX로 내보내기 전까지 이 브라우저에 저장됩니다.',
      authTitle: 'POWDERLINE 계정',
      authOffline: '로컬',
      authOnline: '클라우드',
      authNeedKey: '설정에서 Supabase Publishable Key를 입력하세요.',
      authReady: 'Supabase 연결 완료 — 로그인하면 코스를 동기화합니다.',
      authSignedIn: email => `${email} 계정으로 연결됨`,
      badgeSignedIn: '✓ 로그인 완료',
      badgeApproved: '✓ 승인 회원',
      badgePending: '⏳ 승인 대기 중',
      badgeRejected: '✕ 가입 거절됨',
      adminTitle: '가입 요청 관리',
      emptyPending: '대기 중인 가입 요청이 없습니다.',
      btnApprove: '승인',
      btnReject: '거절',
      btnRefresh: '새로고침 🔄',
      placeholderEmail: '이메일 (아이디)',
      placeholderPassword: '비밀번호',
      placeholderPasswordConfirm: '비밀번호 확인',
      placeholderNickname: '활동할 닉네임',
      placeholderSignupEmail: 'example@email.com',
      labelSignupEmail: '이메일 (아이디)',
      labelSignupPassword: '비밀번호 (6자 이상)',
      labelSignupPasswordConfirm: '비밀번호 확인',
      labelSignupNickname: '닉네임',
      signupModalTitle: '회원가입 신청',
      signupModalDesc: '정보를 입력하고 신청하시면 관리자 승인 후 로그인할 수 있습니다.',
      btnSubmitSignup: '신청하기',
      btnSubmittingSignup: '신청 중...',
      btnLogin: '로그인',
      btnSignUp: '회원가입 신청',
      btnLogout: '로그아웃',
      toastSignupPending: '회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인하실 수 있습니다.',
      toastPasswordMismatch: '비밀번호가 일치하지 않습니다.',
      toastSignupTimeout: 'Supabase 응답이 지연되고 있습니다. 잠시 후 다시 시도하세요.',
      toastSignupFailed: '회원가입 신청 중 오류가 발생했습니다. 다시 시도하세요.',
      signupEmailRequired: '이메일을 입력하세요.',
      signupEmailInvalid: '올바른 이메일 형식으로 입력하세요.',
      signupPasswordRequired: '비밀번호를 입력하세요.',
      signupPasswordTooShort: '비밀번호는 6자 이상이어야 합니다.',
      signupPasswordConfirmRequired: '비밀번호 확인을 입력하세요.',
      signupNicknameRequired: '닉네임을 입력하세요.',
      toastUserApproved: '회원 가입을 승인했습니다',
      toastUserRejected: '회원 가입을 거절했습니다',
      toastPendingNotice: '현재 승인 대기 중입니다. 관리자 승인 후 클라우드 저장 기능을 이용할 수 있습니다.',
      toastRejectedNotice: '가입이 거절된 계정입니다. 관리자에게 문의하세요.',
      settingsSupabase: 'Supabase 연결',
      settingsSupabaseDesc: 'Publishable Key는 이 브라우저에 저장되며 로그인과 사용자별 코스 동기화에 사용됩니다.',
      placeholderSupabaseKey: 'Supabase Publishable Key (sb_publishable_…)',
      supabaseStatusReady: 'Supabase 클라이언트가 초기화되었습니다.',
      supabaseStatusNeedKey: 'Publishable Key를 입력하세요.',
      labelSavedRoutes: '저장된 경로',
      emptySaved: '저장된 경로가 없습니다.',
      btnApply: '적용',
      settingsMapData: '지도 데이터',
      settingsMapDataDesc: '배경 지도와 고도: Mapbox 위성 지도 / 아웃도어 지도 및 Terrain-DEM. 스키 시설: OpenSkiData / OpenSkiMap.org.',
      settingsSkiDataCredit: '스키 데이터: © OpenStreetMap 기여자(ODbL), Skimap.org, Who\'s On First, © Mapterhorn. 제공자 저작자 표시는 지도에 계속 표시됩니다.',
      linkMaplibre: 'MapLibre 백업',
      btnTilt: '기울이기',
      btnResetView: '보기 초기화',
      legendMyRoute: '내 경로',
      legendStartPoint: '시작점',
      profilePanelTitle: '경로 고도·경사도 분석',
      profileHorizDistance: '수평거리',
      profileAscent: '누적 상승',
      profileDescent: '누적 하강',
      profileAvgSlope: '평균 |경사도|',
      profileMaxSlope: '최대 구간 경사도',
      profileEmptyMsg: '경로를 그리거나 GPX를 불러오면 지형 고도 그래프가 표시됩니다.',
      profileWaitingDem: 'Terrain-DEM 고도 데이터를 기다리는 중…',
      profileWaitingTiles: '이 경로의 Terrain-DEM 타일을 기다리는 중…',
      profileNeed2Points: '서로 다른 두 개 이상의 꼭짓점이 필요합니다.',
      profileNote: '경사도는 약 15 m 수평 간격으로 계산합니다. 샘플 간격이 Terrain-DEM의 실제 해상도보다 높은 정확도를 의미하지는 않습니다. 평균은 구간 경사각 절댓값의 수평거리 가중 평균이며, 눈사태 사면 경사도 등급이 아닙니다.',
      mapStatusLoading: 'Mapbox 지형 불러오는 중…',
      mapStatusNeedToken: 'Mapbox 토큰을 불러오지 못했습니다',
      mapStatusReady: '3D 지형 준비 완료',
      mapStatusDemUnavailable: '지형 데이터를 사용할 수 없습니다',
      facilityStatusLoading: '스키 시설 불러오는 중…',
      facilityStatusUnavailable: '데이터 미확보',
      facilityCounts: (l, r, s) => `리프트 ${l} · 슬로프 ${r} · 승하차장 ${s}`,
      toastNeedToken: 'Mapbox 토큰을 불러오지 못했습니다',
      toastStyleSatellite: '위성 지도로 전환했습니다',
      toastStyleTopo: '지형도 / 등고선으로 전환했습니다',
      toastNeedRouteFirst: '먼저 경로를 그리세요',
      toastExportedGpx: 'GPX를 내보냈습니다',
      toastImportedGpx: count => `GPX 꼭짓점 ${count}개를 불러왔습니다`,
      toastLoadedSaved: '저장된 경로를 불러왔습니다',
      toastSavedLocal: '이 브라우저에 경로를 저장했습니다',
      toastSavedCloud: 'Supabase에 코스를 저장했습니다',
      toastCloudLoaded: 'Supabase 코스를 불러왔습니다',
      toastLoginSuccess: '로그인했습니다',
      toastLogoutSuccess: '로그아웃했습니다',
      toastInvalidSupabaseKey: 'sb_publishable_로 시작하는 Publishable Key를 입력하세요',
      toastSupabaseConfigured: 'Supabase 연결을 설정했습니다',
      toastSupabaseUnavailable: 'Supabase 라이브러리를 불러오지 못했습니다',
      toastRegionMoved: r => `${r} 지역으로 이동했습니다`,
      toastDrawStart: '산 위를 클릭하여 경로를 그리세요',
      toastDrawEnd: '지도에 경로를 표시했습니다',
      toastDrawFinishTip: '경로 그리기를 마쳤습니다 — 꼭짓점을 끌어 세밀하게 조정할 수 있습니다',
      toastDeletedVertex: '꼭짓점을 삭제했습니다',
      routeDefaultName: (l, d) => `${l} 경로 ${d}`,
      liftTypeUnknown: '종류 정보 없음',
      liftPopupType: '종류',
      unnamedLift: '이름 없는 리프트',
      toastCourseCut: '코스를 잘라 새 코스로 분할했습니다',
      toastCourseCutNeedPoints: '분할할 중간 꼭짓점을 선택하세요 (처음이나 끝 점 제외)',
      toastUndo: '실행 취소했습니다',
      toastRedo: '다시 실행했습니다',
      toastSavedCourse: '코스를 저장했습니다',
      toastSelectPointFirst: '삭제할 꼭짓점을 먼저 선택하세요',
      toastNoPointsToDelete: '삭제할 꼭짓점이 없습니다',
      toastSegmentDeleted: '구간을 삭제했습니다',
      statusDrawTip: '지도를 클릭하여 코스 포인트를 추가하세요. 끝점에서 계속 이어 그릴 수 있습니다.',
      statusEditTip: '꼭짓점을 드래그하여 이동하거나 클릭하여 선택하세요.',
      statusCutTip: '분할할 기준 꼭짓점을 클릭하세요.',
      statusDeleteSegTip: '삭제할 구간의 시작 꼭짓점을 클릭하세요.',
      statusSelectSecondPoint: '삭제할 구간의 끝 꼭짓점을 클릭하세요.',
      modalUnsavedTitle: '저장되지 않은 변경사항',
      modalUnsavedDesc: '저장하지 않은 코스 작업이 있습니다. 저장하고 종료하시겠습니까, 아니면 변경사항을 취소하시겠습니까?',
      btnModalCancel: '취소 (편집 계속)',
      btnModalDiscard: '취소하고 닫기',
      btnModalSave: '저장 후 닫기',
      toastDiscardedChanges: '변경사항을 취소했습니다',
      toastSavedAndClosed: '코스를 저장하고 편집기를 닫았습니다',
      stationBoarding: '탑승장 (Bottom)',
      stationDropoff: '하차장 (Top)',
      liftTower: '리프트 타워 (Tower)',
      toastGpsDenied: '위치 정보 접근 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.',
      toastGpsUnavailable: 'GPS 위치 정보를 확인할 수 없습니다.',
      toastGpsTimeout: 'GPS 위치 요청 시간이 초과되었습니다.',
      toastGpsActive: '현재 GPS 위치를 추적합니다.',
      toastGpsInsecure: '모바일 GPS는 HTTPS 환경 또는 localhost에서만 지원됩니다.'
    },
    en: {
      docTitle: 'POWDERLINE — Backcountry Route Planner',
      brandSubtitle: 'Backcountry Route Planner',
      labelRegion: 'Region',
      labelMapStyle: 'Map Style',
      btnSatellite: 'Satellite',
      btnTopo: 'Topo / Contours',
      legendLayers: 'Display Layers',
      layerLifts: 'Lifts',
      layerRuns: 'Slopes',
      layerGpx: 'My GPX Route',
      btnCreateCourse: 'Create Course',
      btnFinishDrawing: 'Finish Drawing',
      editorTitle: 'Course Editor',
      editorStatusDefault: 'Select a tool.',
      btnClose: 'Close',
      labelCourseName: 'Course Name',
      placeholderCourseName: 'Course name',
      btnNewCourse: '＋ New Course',
      btnFinishDraw: 'Finish Drawing',
      toolDraw: 'Draw',
      toolEdit: 'Edit Vertices',
      toolCut: '✂ Cut Course',
      toolDeleteSegment: 'Delete Segment',
      btnUndo: 'Undo',
      btnRedo: 'Redo',
      btnDeleteVertex: 'Delete Vertex',
      btnClearCourse: 'Clear Course',
      labelWorkingCourses: 'Working Courses',
      btnSaveCourse: 'Save Course',
      btnImportGpx: 'Import GPX',
      btnExportGpx: 'Export GPX',
      statDistance: 'Distance',
      statPoints: 'Vertices',
      statDescent: 'Descent*',
      hint3D: '* Uses real 3D terrain elevation. Routes are saved in this browser until exported as GPX.',
      authTitle: 'POWDERLINE Account',
      authOffline: 'Local',
      authOnline: 'Cloud',
      authNeedKey: 'Enter the Supabase Publishable Key in settings.',
      authReady: 'Supabase connected — sign in to sync routes.',
      authSignedIn: email => `Connected as ${email}`,
      badgeSignedIn: '✓ Signed in',
      badgeApproved: '✓ Approved',
      badgePending: '⏳ Pending Approval',
      badgeRejected: '✕ Rejected',
      adminTitle: 'Registration Requests',
      emptyPending: 'No pending registration requests.',
      btnApprove: 'Approve',
      btnReject: 'Reject',
      btnRefresh: 'Refresh 🔄',
      placeholderEmail: 'Email (ID)',
      placeholderPassword: 'Password',
      placeholderPasswordConfirm: 'Confirm Password',
      placeholderNickname: 'Nickname',
      placeholderSignupEmail: 'example@email.com',
      labelSignupEmail: 'Email (ID)',
      labelSignupPassword: 'Password (min 6 chars)',
      labelSignupPasswordConfirm: 'Confirm Password',
      labelSignupNickname: 'Nickname',
      signupModalTitle: 'Sign Up Request',
      signupModalDesc: 'Submit your information. You will be able to sign in after admin approval.',
      btnSubmitSignup: 'Submit Request',
      btnSubmittingSignup: 'Submitting...',
      btnLogin: 'Sign in',
      btnSignUp: 'Sign Up Request',
      btnLogout: 'Sign out',
      toastSignupPending: 'Signup request submitted. You can sign in after administrator approval.',
      toastPasswordMismatch: 'Passwords do not match.',
      toastSignupTimeout: 'The Supabase response is taking too long. Please try again shortly.',
      toastSignupFailed: 'An error occurred while submitting the signup request. Please try again.',
      signupEmailRequired: 'Please enter your email.',
      signupEmailInvalid: 'Please enter a valid email address.',
      signupPasswordRequired: 'Please enter a password.',
      signupPasswordTooShort: 'Password must be at least 6 characters.',
      signupPasswordConfirmRequired: 'Please confirm your password.',
      signupNicknameRequired: 'Please enter a nickname.',
      toastUserApproved: 'User registration approved',
      toastUserRejected: 'User registration rejected',
      toastPendingNotice: 'Your account is pending approval. Cloud storage is available after approval.',
      toastRejectedNotice: 'Your registration was rejected. Please contact an administrator.',
      settingsSupabase: 'Supabase Connection',
      settingsSupabaseDesc: 'The Publishable Key is saved in this browser and used for sign-in and per-user route sync.',
      placeholderSupabaseKey: 'Supabase Publishable Key (sb_publishable_…)',
      supabaseStatusReady: 'Supabase client initialized.',
      supabaseStatusNeedKey: 'Enter a Publishable Key.',
      labelSavedRoutes: 'Saved Routes',
      emptySaved: 'No saved routes.',
      btnApply: 'Apply',
      settingsMapData: 'Map Data',
      settingsMapDataDesc: 'Base maps & terrain: Mapbox Satellite / Outdoors & Terrain-DEM. Ski facilities: OpenSkiData / OpenSkiMap.org.',
      settingsSkiDataCredit: 'Ski data: © OpenStreetMap contributors (ODbL), Skimap.org, Who\'s On First, © Mapterhorn. Attributions remain on the map.',
      linkMaplibre: 'MapLibre Backup',
      btnTilt: 'Tilt',
      btnResetView: 'Reset View',
      legendMyRoute: 'My Route',
      legendStartPoint: 'Start Point',
      profilePanelTitle: 'Route Elevation & Slope Profile',
      profileHorizDistance: 'Distance',
      profileAscent: 'Ascent',
      profileDescent: 'Descent',
      profileAvgSlope: 'Avg |Slope|',
      profileMaxSlope: 'Max Slope',
      profileEmptyMsg: 'Draw a route or import GPX to view terrain elevation profile.',
      profileWaitingDem: 'Waiting for Terrain-DEM elevation data…',
      profileWaitingTiles: 'Waiting for Terrain-DEM tiles for this route…',
      profileNeed2Points: 'At least two distinct points are required.',
      profileNote: 'Slope is calculated at ~15m intervals. Sample interval does not imply higher accuracy than DEM resolution. Average is distance-weighted absolute slope angle, not avalanche terrain rating.',
      mapStatusLoading: 'Loading Mapbox terrain…',
      mapStatusNeedToken: 'Mapbox token could not be loaded',
      mapStatusReady: '3D Terrain Ready',
      mapStatusDemUnavailable: 'Terrain data unavailable',
      facilityStatusLoading: 'Loading ski facilities…',
      facilityStatusUnavailable: 'No data available',
      facilityCounts: (l, r, s) => `Lifts ${l} · Slopes ${r} · Stations ${s}`,
      toastNeedToken: 'Mapbox token could not be loaded',
      toastStyleSatellite: 'Switched to Satellite',
      toastStyleTopo: 'Switched to Topo / Contours',
      toastNeedRouteFirst: 'Please draw a route first',
      toastExportedGpx: 'Exported GPX',
      toastImportedGpx: count => `Loaded ${count} GPX vertices`,
      toastLoadedSaved: 'Loaded saved route',
      toastSavedLocal: 'Route saved in this browser',
      toastSavedCloud: 'Route saved to Supabase',
      toastCloudLoaded: 'Loaded routes from Supabase',
      toastLoginSuccess: 'Signed in',
      toastLogoutSuccess: 'Signed out',
      toastInvalidSupabaseKey: 'Enter a Publishable Key starting with sb_publishable_',
      toastSupabaseConfigured: 'Supabase connection configured',
      toastSupabaseUnavailable: 'Could not load the Supabase library',
      toastRegionMoved: r => `Moved to ${r}`,
      toastDrawStart: 'Click on terrain to draw route',
      toastDrawEnd: 'Route displayed on map',
      toastDrawFinishTip: 'Finished drawing — drag vertices to fine-tune',
      toastDeletedVertex: 'Vertex deleted',
      routeDefaultName: (l, d) => `${l} route ${d}`,
      liftTypeUnknown: 'Unknown type',
      liftPopupType: 'Type',
      unnamedLift: 'Unnamed Lift',
      toastCourseCut: 'Course cut and split into a new course',
      toastCourseCutNeedPoints: 'Select an intermediate vertex to split (not first or last point)',
      toastUndo: 'Undone',
      toastRedo: 'Redone',
      toastSavedCourse: 'Course saved',
      toastSelectPointFirst: 'Select a vertex to delete first',
      toastNoPointsToDelete: 'No vertices to delete',
      toastSegmentDeleted: 'Segment deleted',
      statusDrawTip: 'Click on map to add points. Continue drawing from the end point anytime.',
      statusEditTip: 'Drag vertices to move or click to select.',
      statusCutTip: 'Click an intermediate vertex to split course.',
      statusDeleteSegTip: 'Click the start vertex of the segment to delete.',
      statusSelectSecondPoint: 'Click the end vertex of the segment to delete.',
      modalUnsavedTitle: 'Unsaved Changes',
      modalUnsavedDesc: 'You have unsaved changes in your course. Would you like to save before exiting or discard changes?',
      btnModalCancel: 'Cancel (Keep Editing)',
      btnModalDiscard: 'Discard & Close',
      btnModalSave: 'Save & Close',
      toastDiscardedChanges: 'Discarded changes',
      toastSavedAndClosed: 'Saved course and closed editor',
      stationBoarding: 'Boarding Station (Bottom)',
      stationDropoff: 'Drop-off Station (Top)',
      liftTower: 'Lift Tower',
      toastGpsDenied: 'Location permission was denied. Please allow location access in settings.',
      toastGpsUnavailable: 'GPS location is unavailable.',
      toastGpsTimeout: 'GPS location request timed out.',
      toastGpsActive: 'Tracking current GPS location.',
      toastGpsInsecure: 'Mobile GPS requires HTTPS or localhost.'
    }
  };
  const localSavedRoutes = JSON.parse(localStorage.getItem('powderline.routes') || '[]');
  const state = { lang: localStorage.getItem('powderline.lang') || 'ko', selectedLiftId: null, points: [], courses: [], selectedCourseId: null, editorMode: false, tool: 'navigate', selectedVertex: null, segmentStart: null, mapStyle: 'satellite', saved: localSavedRoutes, session: null, profile: null, pendingUsers: [], pendingUsersError: null, myParties: [], currentParty: null, partySchemaReady: false };
  let mobileEditingSavedRoute = null;
  let mobileRoutePointsHidden = false;
  let mobileSelectedSavedIndex = '';
  const mobileCustomCourseRegions = (() => { try { const saved = JSON.parse(localStorage.getItem('powderline.courseRegions') || '[]'); return Array.isArray(saved) ? saved.filter(item => item && /^course-region-\d+$/.test(item.id) && typeof item.label === 'string' && Array.isArray(item.center) && item.center.length === 2 && item.center.every(Number.isFinite)) : [] } catch { return [] } })();
  const $ = s => document.querySelector(s);
  function t(key, ...args) {
    const dict = I18N[state.lang] || I18N.ko;
    const val = dict[key];
    if (typeof val === 'function') return val(...args);
    return val !== undefined ? val : (I18N.ko[key] !== undefined ? I18N.ko[key] : key);
  }
  const skiAttribution = '<a href="https://www.openskidata.org/" target="_blank" rel="noopener">OpenSkiData / OpenSkiMap.org</a> · © OpenStreetMap 기여자 (ODbL)';
  const emptyCollection = { type: 'FeatureCollection', features: [] };
  const appConfig = window.POWDERLINE_CONFIG || {};
  const DEFAULT_SUPABASE_CONFIG = {
    url: appConfig.supabaseUrl || 'https://lxfsvhwibiaspnaduhri.supabase.co',
    publishableKey: appConfig.supabasePublishableKey || 'sb_publishable_1ephBEp88K0I6OK0HoPMXw_QOvHklEY'
  };
  const SUPABASE_URL = localStorage.getItem('powderline.supabaseUrl') || DEFAULT_SUPABASE_CONFIG.url;
  const SUPABASE_KEY_STORAGE = 'powderline.supabasePublishableKey';
  let supabaseClient = null;
  let supabaseAuthSubscription = null;
  let authInitializationComplete = false;
  let mobileAuthActiveView = 'login';
  let setMobileAppView = () => { };
  const MAPBOX_TOKEN_KEY = 'powderline.mapboxCompareToken';
  const MAPBOX_TOKEN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mapbox-public-token`;
  const MAPBOX_STYLES = { satellite: 'mapbox://styles/mapbox/standard-satellite', topo: 'mapbox://styles/mapbox/outdoors-v12' };

  function getCachedMapboxToken() {
    const token = localStorage.getItem(MAPBOX_TOKEN_KEY) || localStorage.getItem('powderline.mapboxToken') || '';
    return token.startsWith('pk.') ? token : '';
  }

  async function loadMapboxToken() {
    const cachedToken = getCachedMapboxToken();
    const storedKey = localStorage.getItem(SUPABASE_KEY_STORAGE) || '';
    const publishableKey = isPublishableKey(storedKey) ? storedKey : DEFAULT_SUPABASE_CONFIG.publishableKey;
    try {
      const response = await fetch(MAPBOX_TOKEN_FUNCTION_URL, {
        method: 'GET',
        headers: { Accept: 'application/json', apikey: publishableKey },
        cache: 'no-store',
        credentials: 'omit'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
      if (!token.startsWith('pk.')) throw new Error('Invalid public token response');
      localStorage.setItem(MAPBOX_TOKEN_KEY, token);
      localStorage.removeItem('powderline.mapboxToken');
      sessionStorage.removeItem(MAPBOX_TOKEN_KEY);
      return token;
    } catch (error) {
      console.warn('Mapbox token auto-load failed; using the last saved token when available.', error);
      return cachedToken;
    }
  }

const mapboxToken=await loadMapboxToken();
const hasMapboxToken=mapboxToken.startsWith('pk.');
const tokenFallbackStyle={version:8,sources:{},layers:[{id:'token-background',type:'background',paint:{'background-color':'#aebcb3'}}]};
mapboxgl.accessToken=mapboxToken;
const map=new mapboxgl.Map({container:'map',style:hasMapboxToken?MAPBOX_STYLES.satellite:tokenFallbackStyle,center:regions.furano.center,zoom:regions.furano.zoom,bearing:regions.furano.bearing,pitch:regions.furano.pitch,antialias:true,maxPitch:75});
map.addControl(new mapboxgl.NavigationControl({showCompass:true}), 'bottom-right');
const geolocateControl = new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
  showUserLocation: true
});
map.addControl(geolocateControl, 'bottom-right');
let pendingLocateToast = true;
function ensureGeolocateControlReady() {
  if (!geolocateControl || geolocateControl._setup) return;
  if (typeof geolocateControl._onMapLoad === 'function') {
    try { map.off('load', geolocateControl._onMapLoad); } catch {}
  }
  if (typeof geolocateControl._setupUI === 'function') {
    try { geolocateControl._setupUI(true); } catch {}
  }
}
function syncLocateButtonsActiveState() {
  const isActive = Boolean(
    geolocateControl &&
    (geolocateControl._watchState === 'ACTIVE_LOCK' ||
     geolocateControl._watchState === 'BACKGROUND' ||
     geolocateControl._watchState === 'WAITING_ACTIVE')
  );
  ['#mobileLocateBtn', '#rideLocateBtn', '#mobileRoutesLocateBtn', '#mobileEditorLocateBtn'].forEach(sel => {
    const btn = $(sel);
    if (btn) {
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }
  });
}
function syncMyLocationBlueDotFromFix(coords, timestamp = Date.now()) {
  if (!geolocateControl || !coords) return;
  const lat = Number(coords.latitude ?? coords.lat);
  const lng = Number(coords.longitude ?? coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  ensureGeolocateControlReady();
  const ws = geolocateControl._watchState;
  if (!ws || ws === 'OFF' || ws === 'ACTIVE_ERROR' || ws === 'BACKGROUND_ERROR') {
    geolocateControl._watchState = 'BACKGROUND';
    if (geolocateControl._geolocateButton) {
      geolocateControl._geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-waiting', 'mapboxgl-ctrl-geolocate-active', 'mapboxgl-ctrl-geolocate-active-error', 'mapboxgl-ctrl-geolocate-background-error');
      geolocateControl._geolocateButton.classList.add('mapboxgl-ctrl-geolocate-background');
    }
    if (typeof geolocateControl._onSuccess === 'function') {
      try {
        geolocateControl._onSuccess({
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : 15,
            heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
            speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null
          },
          timestamp: Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now()
        });
      } catch {}
    }
    syncLocateButtonsActiveState();
  }
}
function triggerMyLocationGps({ center = true } = {}) {
  if (!geolocateControl) return;
  ensureGeolocateControlReady();
  if (center) pendingLocateToast = true;
  const ws = geolocateControl._watchState;
  if (ws === 'ACTIVE_ERROR' || ws === 'BACKGROUND_ERROR' || (ws === 'BACKGROUND' && geolocateControl._geolocationWatchID == null)) {
    geolocateControl._watchState = 'OFF';
  }
  if (!geolocateControl._watchState || geolocateControl._watchState === 'OFF') {
    geolocateControl.trigger();
    if (!center && geolocateControl._watchState === 'WAITING_ACTIVE') {
      geolocateControl._watchState = 'BACKGROUND';
      if (geolocateControl._geolocateButton) {
        geolocateControl._geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-waiting');
        geolocateControl._geolocateButton.classList.add('mapboxgl-ctrl-geolocate-background');
      }
    }
    syncLocateButtonsActiveState();
    return;
  }
  if (geolocateControl._watchState === 'BACKGROUND') {
    if (center) {
      geolocateControl.trigger();
      if (pendingLocateToast && geolocateControl._lastKnownPosition) {
        pendingLocateToast = false;
        toast(t('toastGpsActive'));
      }
    }
    syncLocateButtonsActiveState();
    return;
  }
  // Already ACTIVE_LOCK or WAITING_ACTIVE: keep blue dot active instead of toggling OFF
  if (center) {
    const lastPos = geolocateControl._lastKnownPosition;
    if (lastPos?.coords && Number.isFinite(lastPos.coords.longitude) && Number.isFinite(lastPos.coords.latitude)) {
      if (typeof geolocateControl._updateCamera === 'function') {
        geolocateControl._updateCamera(lastPos);
      } else {
        map.easeTo({ center: [lastPos.coords.longitude, lastPos.coords.latitude], duration: 600 });
      }
      pendingLocateToast = false;
      toast(t('toastGpsActive'));
    } else if (typeof partyGpsRuntime === 'object' && partyGpsRuntime?.lastFix && Number.isFinite(partyGpsRuntime.lastFix.lng) && Number.isFinite(partyGpsRuntime.lastFix.lat)) {
      map.easeTo({ center: [partyGpsRuntime.lastFix.lng, partyGpsRuntime.lastFix.lat], duration: 600 });
      pendingLocateToast = false;
      toast(t('toastGpsActive'));
    }
  }
  syncLocateButtonsActiveState();
}
geolocateControl.on('trackuserlocationstart', syncLocateButtonsActiveState);
geolocateControl.on('trackuserlocationend', syncLocateButtonsActiveState);
geolocateControl.on('geolocate', (e) => {
  if (pendingLocateToast) {
    pendingLocateToast = false;
    toast(t('toastGpsActive'));
  }
  syncLocateButtonsActiveState();
  if (typeof handlePartyGeolocateEvent === 'function') handlePartyGeolocateEvent(e);
});
geolocateControl.on('error', (e) => {
  pendingLocateToast = false;
  syncLocateButtonsActiveState();
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    toast(t('toastGpsInsecure'));
    return;
  }
  if (e && e.code === 1) toast(t('toastGpsDenied'));
  else if (e && e.code === 2) toast(t('toastGpsUnavailable'));
  else if (e && e.code === 3) toast(t('toastGpsTimeout'));
  else toast(t('toastGpsUnavailable'));
});
  const PROFILE_SAMPLE_METERS = 15;
  const profile = { samples: [], timer: null, pending: false, generation: 0, marker: null, layout: null };
  const editHistory = { past: [], future: [], limit: 50 };
  let splitState = null;
  let courseSequence = 0, segmentMarker = null;
  let skiLoadToken = 0, lastFacilityState = { status: 'loading', counts: null };
  function updateFacilityStatus(status, counts) {
    lastFacilityState = { status, counts };
    const el = $('#facilityStatus');
    if (!el) return;
    if (status === 'loading') el.textContent = t('facilityStatusLoading');
    else if (status === 'available' && counts) el.textContent = t('facilityCounts', counts.lifts || 0, counts.runs || 0, counts.stations || 0);
    else el.textContent = t('facilityStatusUnavailable');
  }
  function setLanguage(lang) {
    state.lang = lang === 'en' ? 'en' : 'ko';
    localStorage.setItem('powderline.lang', state.lang);
    document.documentElement.lang = state.lang;
    $('#langKoBtn')?.classList.toggle('active', state.lang === 'ko');
    $('#langEnBtn')?.classList.toggle('active', state.lang === 'en');
    $('#langKoBtn')?.setAttribute('aria-pressed', String(state.lang === 'ko'));
    $('#langEnBtn')?.setAttribute('aria-pressed', String(state.lang === 'en'));
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (I18N[state.lang]?.[k]) el.textContent = I18N[state.lang][k];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const k = el.dataset.i18nPlaceholder;
      if (I18N[state.lang]?.[k]) el.placeholder = I18N[state.lang][k];
    });
    if ($('#drawBtn')) $('#drawBtn').textContent = state.drawing ? t('btnFinishDrawing') : t('btnCreateCourse');
    updateAuthUi();
    if (lastFacilityState) updateFacilityStatus(lastFacilityState.status, lastFacilityState.counts);
    if (!profile.samples.length) $('#profileMessage').textContent = t('profileEmptyMsg');
    renderSaved();
  }

  function isPublishableKey(key) {
    return typeof key === 'string' && (key.startsWith('sb_publishable_') || key.startsWith('eyJ'));
  }

  function updateAuthUi(message = '') {
    const configured = Boolean(supabaseClient);
    const signedIn = Boolean(state.session?.user);
    const profile = state.profile;
    const isApproved = profile?.status === 'approved';
    const isAdmin = profile?.role === 'admin';

    // Mobile Auth Display Control (Requirement: unapproved users see Stitch Mobile Auth screens)
    if (typeof syncMobileAuthState === 'function') {
      syncMobileAuthState(message);
    }
    if (typeof syncStitchAccountUI === 'function') {
      syncStitchAccountUI();
    }

    if ($('#authForm')) $('#authForm').hidden = signedIn;
    if ($('#signedInPanel')) $('#signedInPanel').hidden = !signedIn;
    if ($('#signedInEmail')) $('#signedInEmail').textContent = state.session?.user?.email || '';
    if ($('#signedInNickname')) {
      const nick = profile?.nickname || state.session?.user?.user_metadata?.nickname || '';
      $('#signedInNickname').textContent = nick ? `@${nick}` : '';
    }
    if ($('#userRoleBadge')) {
      $('#userRoleBadge').hidden = !isAdmin;
    }
    if ($('#userStatusBadge')) {
      $('#userStatusBadge').className = 'signed-in-badge';
      if (profile?.status === 'pending') {
        $('#userStatusBadge').classList.add('status-badge-pending');
        $('#userStatusBadge').textContent = t('badgePending');
      } else if (profile?.status === 'rejected') {
        $('#userStatusBadge').classList.add('status-badge-rejected');
        $('#userStatusBadge').textContent = t('badgeRejected');
      } else if (isApproved) {
        $('#userStatusBadge').classList.add('status-badge-approved');
        $('#userStatusBadge').textContent = t('badgeApproved');
      } else {
        $('#userStatusBadge').textContent = t('badgeSignedIn');
      }
    }

    if ($('#loginBtn')) $('#loginBtn').disabled = !configured;
    if ($('#signupBtn')) $('#signupBtn').disabled = !configured;
    const mobileLoginSubmit = $('#mobileLoginSubmitBtn');
    const mobileSignupSubmit = $('#mobileSignupSubmitBtn');
    if (mobileLoginSubmit) mobileLoginSubmit.disabled = !configured || !authInitializationComplete || mobileLoginSubmit.dataset.busy === 'true';
    if (mobileSignupSubmit) mobileSignupSubmit.disabled = !configured || !authInitializationComplete || mobileSignupSubmit.dataset.busy === 'true';
    if ($('#logoutBtn')) $('#logoutBtn').disabled = false;
    if ($('#authStatusBadge')) {
      $('#authStatusBadge').textContent = signedIn ? t('authOnline') : t('authOffline');
    }
    if ($('#authStatus')) {
      $('#authStatus').textContent = message || (signedIn ? t('authSignedIn', state.session.user.email || '') : configured ? t('authReady') : t('authNeedKey'));
    }
    if ($('#supabaseStatus')) {
      $('#supabaseStatus').textContent = configured ? t('supabaseStatusReady') : t('supabaseStatusNeedKey');
    }

    // Admin panel visibility
    const showAdmin = signedIn && isAdmin;
    if ($('#adminPanel')) {
      $('#adminPanel').hidden = !showAdmin;
    }
    if (typeof syncStitchAccountUI === 'function') syncStitchAccountUI();
  }

  async function loadUserProfile() {
    if (!supabaseClient || !state.session?.user) {
      state.profile = null;
      updateAuthUi();
      return null;
    }
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id,email,nickname,status,role')
        .eq('id', state.session.user.id)
        .single();
      if (error) {
        console.warn('Profile fetch warning:', error);
        state.profile = null;
      } else {
        state.profile = data;
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
      state.profile = null;
    }
    updateAuthUi();
    if (state.profile?.role === 'admin') {
      await loadPendingUsers();
    }
    return state.profile;
  }

  async function loadPendingUsers() {
    if (!supabaseClient || state.profile?.role !== 'admin') return;
    const countBadge = $('#pendingCountBadge');
    const stitchCount = $('#stitchPendingCount');
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id,email,nickname,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('loadPendingUsers error:', error);
        state.pendingUsersError = error.message || '조회 권한이 없거나 오류가 발생했습니다.';
        state.pendingUsers = [];
        if (countBadge) countBadge.textContent = '!';
        if (stitchCount) stitchCount.textContent = '!';
        renderPendingUsers();
        return;
      }
      state.pendingUsersError = null;
      state.pendingUsers = data || [];
      if (countBadge) countBadge.textContent = String(state.pendingUsers.length);
      if (stitchCount) stitchCount.textContent = String(state.pendingUsers.length);
      renderPendingUsers();
    } catch (e) {
      console.error('Failed to load pending users:', e);
      state.pendingUsersError = e?.message || '네트워크 오류가 발생했습니다.';
      state.pendingUsers = [];
      if (countBadge) countBadge.textContent = '!';
      if (stitchCount) stitchCount.textContent = '!';
      renderPendingUsers();
    }
  }

  function renderPendingUsers() {
    const listEl = $('#pendingList');
    if (listEl) {
      if (state.pendingUsersError) {
        listEl.innerHTML = `<div class="pending-error-notice" style="padding:10px;border-radius:6px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;font-size:12px;display:flex;flex-direction:column;gap:4px;">
        <strong>⚠️ 조회 오류 (RLS 또는 권한 차단)</strong>
        <span>${escapeHtml(state.pendingUsersError)}</span>
        <span style="color:#94a3b8;font-size:11px;">현재 계정의 role='admin' 및 status='approved' 여부, RLS 정책을 확인하세요.</span>
      </div>`;
      } else if (!state.pendingUsers.length) {
        listEl.innerHTML = `<p class="empty" data-i18n="emptyPending">${t('emptyPending')}</p>`;
      } else {
        listEl.innerHTML = state.pendingUsers.map(u => `
        <div class="pending-item" data-id="${u.id}">
          <div class="pending-meta">
            <div class="pending-name">${escapeHtml(u.nickname || u.email)}</div>
            <div class="pending-email">${escapeHtml(u.email)}</div>
          </div>
          <div class="pending-actions">
            <button type="button" class="btn-approve" data-id="${u.id}" data-action="approve">${t('btnApprove')}</button>
            <button type="button" class="btn-reject" data-id="${u.id}" data-action="reject">${t('btnReject')}</button>
          </div>
        </div>
      `).join('');
      }
    }

    // Also sync Stitch Mobile pending list
    const stitchList = $('#stitchPendingList');
    const stitchCount = $('#stitchPendingCount');
    if (stitchCount) {
      stitchCount.textContent = state.pendingUsersError ? '!' : String(state.pendingUsers.length);
    }
    if (stitchList) {
      if (state.pendingUsersError) {
        stitchList.innerHTML = `
        <div class="stitch-pending-error-card" style="padding:12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#fca5a5;font-size:12px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-weight:700;display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:16px;color:#ef4444;">error</span>
            <span>대기 목록 조회 차단됨</span>
          </div>
          <span style="font-size:11px;color:#fecaca;line-height:1.4;">${escapeHtml(state.pendingUsersError)}</span>
          <span style="font-size:10px;color:#94a3b8;">RLS 정책 또는 관리자 계정 상태(role='admin', status='approved')를 확인하세요.</span>
        </div>`;
      } else if (!state.pendingUsers.length) {
        stitchList.innerHTML = '<p class="stitch-empty-text">대기 중인 가입 요청이 없습니다.</p>';
      } else {
        stitchList.innerHTML = state.pendingUsers.map(u => `
        <div class="stitch-pending-card" data-id="${u.id}">
          <div class="stitch-pending-user-info">
            <span class="stitch-pending-username">${escapeHtml(u.nickname || u.email)}</span>
            <span class="stitch-pending-email">${escapeHtml(u.email)}</span>
          </div>
          <div class="stitch-pending-actions">
            <button type="button" class="stitch-btn-approve" data-id="${u.id}" data-action="approve">승인</button>
            <button type="button" class="stitch-btn-reject" data-id="${u.id}" data-action="reject">거절</button>
          </div>
        </div>
      `).join('');
      }
    }
  }

  async function handleSetUserStatus(targetUserId, newStatus) {
    if (!supabaseClient || state.profile?.role !== 'admin') return;
    try {
      const { data, error } = await supabaseClient.rpc('set_user_status', {
        target_user_id: targetUserId,
        new_status: newStatus
      });
      if (error) {
        toast(error.message);
        return;
      }
      toast(newStatus === 'approved' ? t('toastUserApproved') : t('toastUserRejected'));
      await loadPendingUsers();
    } catch (e) {
      console.error('set_user_status error:', e);
      toast(e.message || 'Failed to update user status');
    }
  }

  function useLocalRoutes() {
    state.saved = JSON.parse(localStorage.getItem('powderline.routes') || '[]');
    renderSaved();
  }

  async function loadCloudRoutes({ notify = false } = {}) {
    if (!supabaseClient || !state.session?.user) return;
    const client = supabaseClient;
    const userId = state.session.user.id;
    const { data, error } = await client
      .from('powderline_routes')
      .select('id,name,region,points,distance_km,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (client !== supabaseClient || state.session?.user?.id !== userId) return;
    if (error) {
      updateAuthUi(error.message);
      toast(error.message);
      return;
    }
    state.saved = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      region: row.region,
      points: Array.isArray(row.points) ? row.points.filter(point => Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat))).map(point => ({ lng: Number(point.lng), lat: Number(point.lat) })) : [],
      km: Number.isFinite(Number(row.distance_km)) ? Number(row.distance_km) : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: 'cloud'
    }));
    renderSaved();
    if (notify) toast(t('toastCloudLoaded'));
  }

  function renderPartyMain() {
    const status = $('#partyMainStatus');
    const entries = $('#partyMainEntries');
    if (!status || !entries) return;
    const parties = state.myParties;
    status.hidden = parties.length > 0;
    status.textContent = !state.session?.user ? '로그인 후 내 파티를 확인할 수 있습니다.'
      : !state.partySchemaReady ? '파티 저장소 연결 준비 중입니다.'
        : '참여 및 관리 중인 파티가 없습니다.';
    entries.hidden = !parties.length;
    entries.innerHTML = parties.map(party => `<button class="party-main-entry" type="button" data-party-id="${party.id}"><strong>${escapeHtml(party.name)}</strong><small>${escapeHtml(regions[party.region]?.label || party.region)}</small></button>`).join('');
    const leaderLink = $('#partyOpenLeaderBtn');
    const joinedLink = $('#partyOpenJoinedBtn');
    if (leaderLink) leaderLink.hidden = !state.currentParty?.isLeader;
    if (joinedLink) joinedLink.hidden = !state.currentParty;
  }

  function setPartyCreateAvailability() {
    const button = $('#partyCreateSubmitBtn');
    if (button) button.disabled = !state.partySchemaReady || state.profile?.status !== 'approved';
  }

  function normalizePartyRouteRow(row) {
    if (!row?.route_id) return null;
    const points = Array.isArray(row.points)
      ? row.points
        .filter(point => Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat)))
        .map(point => ({ lng: Number(point.lng), lat: Number(point.lat) }))
      : [];
    const rawKm = Number(row.distance_km);
    return {
      id: row.route_id,
      name: row.name || '이름 없는 코스',
      region: row.region || '',
      points,
      km: Number.isFinite(rawKm) && rawKm > 0 ? rawKm : (points.length >= 2 ? distanceKm(points) : 0),
      isActive: Boolean(row.is_active),
      order: Number(row.route_order) || 0,
      source: 'cloud'
    };
  }

  function resolvePartySharedCourses(party) {
    if (!party) return [];
    const routeIds = Array.isArray(party.route_ids) ? party.route_ids.filter(Boolean) : [];
    const rpcCourses = Array.isArray(party.partyRoutes) ? party.partyRoutes.filter(Boolean) : [];
    const existingCourses = Array.isArray(party.sharedCourses) ? party.sharedCourses.filter(Boolean) : [];
    if (routeIds.length) {
      return routeIds.map(id =>
        rpcCourses.find(route => route.id === id)
        || state.saved.find(route => route.id === id)
        || existingCourses.find(route => route.id === id)
      ).filter(Boolean);
    }
    if (rpcCourses.length) return rpcCourses;
    if (existingCourses.length) return existingCourses;
    return party.sharedCourse ? [party.sharedCourse] : [];
  }

const PARTY_GPS_INTERVAL_OPTIONS = [10, 30, 60];
const PARTY_GPS_DEFAULT_INTERVAL_SECONDS = 30;
const PARTY_GPS_STATIONARY_HOLD_MS = 60000;
const PARTY_GPS_STATIONARY_INTERVAL_MS = 300000;
const PARTY_GPS_MOVE_MIN_METERS = 15;
const partyMemberMarkers = new Map();
const partyGpsRuntime = {
  partyId: '',
  watchId: null,
  syncTimer: null,
  lastFix: null,
  anchorFix: null,
  powerSaveMode: false,
  lastSentAt: 0,
  sending: false,
  polling: false
};

function sanitizePartyGpsInterval(value) {
  const num = Number(value);
  return PARTY_GPS_INTERVAL_OPTIONS.includes(num) ? num : PARTY_GPS_DEFAULT_INTERVAL_SECONDS;
}

function computePartyMemberGpsStatus(row, intervalSeconds = PARTY_GPS_DEFAULT_INTERVAL_SECONDS) {
  if (row?.location_sharing_enabled === false || row?.locationSharingEnabled === false) return 'off';
  const lat = Number(row?.lat ?? row?.last_latitude);
  const lng = Number(row?.lng ?? row?.last_longitude);
  const updatedRaw = row?.location_updated_at || row?.updatedAt || null;
  const updatedMs = updatedRaw ? Date.parse(updatedRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(updatedMs)) return 'offline';
  const ageMs = Math.max(0, Date.now() - updatedMs);
  const onlineWindowMs = Math.max(sanitizePartyGpsInterval(intervalSeconds) * 3500, PARTY_GPS_STATIONARY_INTERVAL_MS + 60000);
  return ageMs <= onlineWindowMs ? 'online' : 'offline';
}

function normalizePartyMemberRow(row, partyIntervalSeconds = PARTY_GPS_DEFAULT_INTERVAL_SECONDS) {
  if (!row) return null;
  const intervalSeconds = sanitizePartyGpsInterval(row.gps_interval_seconds ?? partyIntervalSeconds);
  const sharingEnabled = row.location_sharing_enabled !== false && row.locationSharingEnabled !== false;
  const rawLat = row.lat ?? row.last_latitude;
  const rawLng = row.lng ?? row.last_longitude;
  const rawAcc = row.accuracy_m ?? row.last_accuracy_m ?? row.accuracy;
  const rawHeading = row.heading ?? row.last_heading;
  const rawSpeed = row.speed_mps ?? row.last_speed_mps ?? row.speed;
  const lat = sharingEnabled && rawLat !== null && rawLat !== undefined && Number.isFinite(Number(rawLat)) ? Number(rawLat) : null;
  const lng = sharingEnabled && rawLng !== null && rawLng !== undefined && Number.isFinite(Number(rawLng)) ? Number(rawLng) : null;
  const accuracy = sharingEnabled && rawAcc !== null && rawAcc !== undefined && Number.isFinite(Number(rawAcc)) ? Number(rawAcc) : null;
  const heading = sharingEnabled && rawHeading !== null && rawHeading !== undefined && Number.isFinite(Number(rawHeading)) ? Number(rawHeading) : null;
  const speed = sharingEnabled && rawSpeed !== null && rawSpeed !== undefined && Number.isFinite(Number(rawSpeed)) ? Number(rawSpeed) : null;
  const updatedAt = sharingEnabled ? (row.location_updated_at || row.updatedAt || null) : null;
  return {
    party_id: row.party_id,
    user_id: row.user_id,
    role: row.role || 'member',
    nickname: row.nickname || row.name || '이름 없음',
    locationSharingEnabled: sharingEnabled,
    gpsIntervalSeconds: intervalSeconds,
    lat,
    lng,
    accuracy,
    heading,
    speed,
    updatedAt,
    gpsStatus: computePartyMemberGpsStatus(
      { locationSharingEnabled: sharingEnabled, lat, lng, updatedAt },
      intervalSeconds
    )
  };
}

function getMyPartyMemberRecord(party = state.currentParty) {
  const userId = state.session?.user?.id;
  if (!party || !userId || !Array.isArray(party.members)) return null;
  return party.members.find(member => member?.user_id === userId) || null;
}

function isMyPartyLocationSharingEnabled(party = state.currentParty) {
  if (!party) return false;
  const myMember = getMyPartyMemberRecord(party);
  if (myMember && typeof myMember.locationSharingEnabled === 'boolean') {
    return myMember.locationSharingEnabled;
  }
  if (typeof party.myLocationSharingEnabled === 'boolean') {
    return party.myLocationSharingEnabled;
  }
  return party.location_sharing_enabled !== false;
}

function selectMyParty(party) {
  const previousPartyId = state.currentParty?.id;
  const routeIds = Array.isArray(party.route_ids) ? party.route_ids.filter(Boolean) : [];
  const sharedCourses = resolvePartySharedCourses(party);
  const previousSelectedId = previousPartyId === party.id ? state.currentParty?.selectedRouteId : null;
  const routeId = [previousSelectedId, party.active_route_id, routeIds[0], sharedCourses[0]?.id]
    .find(id => id && sharedCourses.some(route => route.id === id))
    || party.active_route_id || routeIds[0] || sharedCourses[0]?.id || '';
  const sharedCourse = sharedCourses.find(route => route.id === routeId) || state.saved.find(route => route.id === routeId);
  const gpsIntervalSeconds = sanitizePartyGpsInterval(
    party.gps_interval_seconds ?? party.members?.[0]?.gpsIntervalSeconds
  );
  const members = Array.isArray(party.members)
    ? party.members.map(member => normalizePartyMemberRow(member, gpsIntervalSeconds)).filter(Boolean)
    : [];
  const myMember = members.find(member => member.user_id === state.session?.user?.id);
  state.currentParty = {
    ...party,
    gps_interval_seconds: gpsIntervalSeconds,
    members,
    myLocationSharingEnabled: myMember ? myMember.locationSharingEnabled : party.location_sharing_enabled !== false,
    inviteCode:party.invite_code,
    isLeader:party.leader_id === state.session?.user?.id,
    sharedCourses,
    selectedRouteId:sharedCourse?.id || routeId || '',
    sharedCourse
  };
  if (typeof syncPartyGpsRuntimeForCurrentParty === 'function') {
    syncPartyGpsRuntimeForCurrentParty();
  }
  if (typeof syncPartyMemberMapMarkers === 'function') {
    syncPartyMemberMapMarkers();
  }
}

async function fetchMyPartyMemberRows(client, partyId = null) {
  try {
    const { data, error } = await client.rpc('list_my_party_member_locations', { p_party_id: partyId });
    if (!error) {
      return { rows: data || [], hasLocationRpc: true };
    }
    if (!['PGRST202', '42883'].includes(error.code)) {
      console.warn('list_my_party_member_locations error:', error);
    }
  } catch (err) {
    console.warn('list_my_party_member_locations exception:', err);
  }
  const { data: fallbackRows, error: fallbackError } = await client.rpc('list_my_party_members');
  if (fallbackError) throw fallbackError;
  return {
    rows: (fallbackRows || []).filter(row => !partyId || row.party_id === partyId),
    hasLocationRpc: false
  };
}

async function loadMyParties({selectedId} = {}) {
  const client = supabaseClient;
  const userId = state.session?.user?.id;
  const previousPartyId = selectedId || state.currentParty?.id;
  state.partySchemaReady = false;
  state.myParties = [];
  state.currentParty = null;
  if (!client || !userId || state.profile?.status !== 'approved') {
    renderPartyMain();
    setPartyCreateAvailability();
    return;
  }
  let data, error;
  try {
    ({data, error} = await client.from('parties')
      .select('id,leader_id,name,region,max_members,invite_code,route_ids,location_sharing_enabled,active_route_id,created_at')
      .order('created_at', {ascending:false}));
  } catch (requestError) {
    console.warn('loadMyParties error:', requestError);
    renderPartyMain();
    setPartyCreateAvailability();
    return;
  }
  if (client !== supabaseClient || state.session?.user?.id !== userId) return;
  if (error) {
    if (!['42P01', '42703', 'PGRST205'].includes(error.code)) console.warn('loadMyParties error:', error);
    renderPartyMain();
    setPartyCreateAvailability();
    return;
  }
  let memberRows = [];
  try {
    const result = await fetchMyPartyMemberRows(client, null);
    memberRows = result.rows || [];
  } catch (membersError) {
    console.warn('loadMyParties members error:', membersError);
    toast('파티원 목록을 불러오지 못했습니다.');
  }
  if (client !== supabaseClient || state.session?.user?.id !== userId) return;
  let routeRows = [];
  try {
    const {data:rows, error:routesError} = await client.rpc('list_my_party_routes');
    if (routesError) {
      if (!['PGRST202', '42883'].includes(routesError.code)) console.warn('loadMyParties routes error:', routesError);
    } else {
      routeRows = rows || [];
    }
  } catch (routesError) {
    console.warn('loadMyParties routes error:', routesError);
  }
  if (client !== supabaseClient || state.session?.user?.id !== userId) return;
  const membersByParty = new Map();
  const intervalByParty = new Map();
  for (const rawMember of memberRows || []) {
    if (!rawMember?.party_id) continue;
    const intervalSec = sanitizePartyGpsInterval(rawMember.gps_interval_seconds);
    if (rawMember.gps_interval_seconds) intervalByParty.set(rawMember.party_id, intervalSec);
    const normalizedMember = normalizePartyMemberRow(rawMember, intervalByParty.get(rawMember.party_id) || intervalSec);
    if (!normalizedMember) continue;
    if (!membersByParty.has(rawMember.party_id)) membersByParty.set(rawMember.party_id, []);
    membersByParty.get(rawMember.party_id).push(normalizedMember);
  }
  const routesByParty = new Map();
  for (const row of routeRows || []) {
    const normalized = normalizePartyRouteRow(row);
    if (!normalized || !row.party_id) continue;
    if (!routesByParty.has(row.party_id)) routesByParty.set(row.party_id, []);
    routesByParty.get(row.party_id).push(normalized);
  }
  state.partySchemaReady = true;
  state.myParties = (data || []).map(party => ({
    ...party,
    gps_interval_seconds: intervalByParty.get(party.id) || sanitizePartyGpsInterval(party.gps_interval_seconds),
    members:membersByParty.get(party.id) || [],
    partyRoutes:routesByParty.get(party.id) || []
  }));
  const party = state.myParties.find(item => item.id === previousPartyId) || state.myParties[0];
  if (party) selectMyParty(party);
  else if (typeof stopPartyGpsRuntime === 'function') stopPartyGpsRuntime({ clearMarkers: true });
  renderPartyMain();
  setPartyCreateAvailability();
}

async function initializeSupabase(key=localStorage.getItem(SUPABASE_KEY_STORAGE)||DEFAULT_SUPABASE_CONFIG.publishableKey){
  authInitializationComplete=false;
  syncMobileAuthState();
  if (typeof stopPartyGpsRuntime === 'function') stopPartyGpsRuntime({ clearMarkers: true });
  supabaseAuthSubscription?.unsubscribe();
  supabaseAuthSubscription=null;
  supabaseClient=null;
  state.session=null;
  state.partySchemaReady=false;
  state.myParties=[];
  state.currentParty=null;
  renderPartyMain();
  setPartyCreateAvailability();
  if(!isPublishableKey(key)){
    authInitializationComplete=true;
    updateAuthUi();
    useLocalRoutes();
    return false;
  }
  if (!window.supabase?.createClient) {
      authInitializationComplete = true;
      updateAuthUi(t('toastSupabaseUnavailable'));
      toast(t('toastSupabaseUnavailable'));
      return false;
    }
    const client = window.supabase.createClient(SUPABASE_URL, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'powderline.supabase.auth' }
    });
    supabaseClient = client;
    let session = null;
    let error = null;
    try {
      const result = await client.auth.getSession();
      session = result.data?.session || null;
      error = result.error || null;
    } catch (sessionError) {
      console.warn('Session restore failed:', sessionError);
      authInitializationComplete = true;
      state.session = null;
      state.profile = null;
      updateAuthUi(sessionError?.message || t('toastSupabaseUnavailable'));
      useLocalRoutes();
      return false;
    }
    if (client !== supabaseClient) return false;
    if (error) {
      console.warn('Session restore error:', error);
      updateAuthUi(error.message);
    }
    state.session = session;
    try {
      if (session) {
        await loadUserProfile();
        if (state.profile?.status === 'approved') {
          await loadCloudRoutes();
        } else {
          useLocalRoutes();
        }
      } else {
        state.profile = null;
        updateAuthUi();
        useLocalRoutes();
      }
    } catch (initializationError) {
      console.warn('Supabase account initialization failed:', initializationError);
      error = initializationError;
      state.profile = null;
      useLocalRoutes();
    }
    await loadMyParties();
    await loadReceivedPartyInvites();
    const { data } = client.auth.onAuthStateChange(async (event, nextSession) => {
      if (client !== supabaseClient) return;
      const previousUserId = state.session?.user?.id;
      state.session = nextSession || null;
      if (nextSession?.user) {
        await loadUserProfile();
        if (nextSession.user.id !== previousUserId) {
          if (state.profile?.status === 'approved') {
            await loadCloudRoutes({ notify: event === 'SIGNED_IN' });
          } else {
            useLocalRoutes();
          }
        }
      } else {
        state.profile = null;
        updateAuthUi();
        useLocalRoutes();
      }
      await loadMyParties();
      await loadReceivedPartyInvites();
    });
    supabaseAuthSubscription = data?.subscription;
    authInitializationComplete = true;
    updateAuthUi(error?.message || '');
    return true;
  }
  function setTerrain() { if (!map.getSource('mapbox-dem')) map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 }); map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.0 }) }

  function buildLiftDecorations(liftFeatures) {
    const towerFeatures = [];
    const terminalFeatures = [];

    for (const f of liftFeatures) {
      if (!f.geometry) continue;
      let coords = [];
      if (f.geometry.type === 'LineString') {
        coords = [f.geometry.coordinates];
      } else if (f.geometry.type === 'MultiLineString') {
        coords = f.geometry.coordinates;
      }

      const liftId = f.properties?.id || '';
      const liftName = f.properties?.name || '';
      const liftType = f.properties?.liftType || '';

      for (const line of coords) {
        if (!line || line.length < 2) continue;

        // Start: Boarding Station (index 0)
        terminalFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [line[0][0], line[0][1]] },
          properties: {
            liftId,
            liftName,
            liftType,
            role: 'boarding',
            label: t('stationBoarding')
          }
        });

        // End: Drop-off Station (last index)
        const last = line[line.length - 1];
        terminalFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [last[0], last[1]] },
          properties: {
            liftId,
            liftName,
            liftType,
            role: 'dropoff',
            label: t('stationDropoff')
          }
        });

        // Calculate total line length and segment distances
        const segDists = [];
        let totalDist = 0;
        for (let i = 1; i < line.length; i++) {
          const d = horizontalMeters({ lng: line[i - 1][0], lat: line[i - 1][1] }, { lng: line[i][0], lat: line[i][1] });
          segDists.push(d);
          totalDist += d;
        }

        // Generate towers along line only every ~220 meters, with at least 45m margin from terminals
        const towerInterval = 220;
        const count = Math.floor(totalDist / towerInterval);
        if (count > 0 && totalDist > 200) {
          for (let k = 1; k <= count; k++) {
            const targetDist = k * (totalDist / (count + 1));
            if (targetDist < 45 || targetDist > totalDist - 45) continue;

            // Find coordinate at targetDist
            let accum = 0;
            for (let s = 0; s < segDists.length; s++) {
              if (accum + segDists[s] >= targetDist) {
                const segRemain = targetDist - accum;
                const ratio = segDists[s] > 0 ? (segRemain / segDists[s]) : 0;
                const pA = line[s];
                const pB = line[s + 1];
                const lng = pA[0] + (pB[0] - pA[0]) * ratio;
                const lat = pA[1] + (pB[1] - pA[1]) * ratio;
                towerFeatures.push({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [lng, lat] },
                  properties: {
                    liftId,
                    liftName,
                    liftType,
                    label: t('liftTower'),
                    towerNum: k
                  }
                });
                break;
              }
              accum += segDists[s];
            }
          }
        }
      }
    }

    return {
      towers: { type: 'FeatureCollection', features: towerFeatures },
      terminals: { type: 'FeatureCollection', features: terminalFeatures }
    };
  }

  function addSkiLayers() {
    map.addSource('ski-facilities', { type: 'geojson', data: emptyCollection, attribution: skiAttribution });
    map.addSource('ski-lift-towers', { type: 'geojson', data: emptyCollection });
    map.addSource('ski-lift-terminals', { type: 'geojson', data: emptyCollection });

    // Ski runs (슬로프 선을 얇고 차분하게 표현하여 리프트와 경로가 돋보이도록 조정)
    map.addLayer({
      id: 'ski-runs',
      type: 'line',
      source: 'ski-facilities',
      filter: ['==', ['get', 'powderlineType'], 'run'],
      paint: {
        'line-color': ['match', ['get', 'difficulty'], 'novice', '#54b948', 'easy', '#54b948', 'intermediate', '#2788d3', 'advanced', '#e74b3c', 'expert', '#202725', 'freeride', '#b14bd1', '#2788d3'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 12, 1.2, 15, 2.0],
        'line-opacity': .65
      }
    });

    // 1. Lift Dark Outline / Casing (리프트를 확실하게 강조하는 어두운 외곽선)
    map.addLayer({
      id: 'ski-lifts-casing',
      type: 'line',
      source: 'ski-facilities',
      filter: ['==', ['get', 'powderlineType'], 'lift'],
      paint: {
        'line-color': ['case', ['==', ['get', 'id'], state.selectedLiftId || ''], '#1e3a8a', '#1c1917'],
        'line-width': ['case',
          ['==', ['get', 'id'], state.selectedLiftId || ''],
          ['interpolate', ['linear'], ['zoom'], 9, 10, 13, 14, 16, 18],
          ['interpolate', ['linear'], ['zoom'], 9, 7.0, 13, 9.5, 16, 12.5]
        ],
        'line-opacity': 0.92
      }
    });

    // 2. Lift Main Line (리프트를 가장 두껍고 뚜렷하게 강조하는 주황색 실선)
    map.addLayer({
      id: 'ski-lifts-line',
      type: 'line',
      source: 'ski-facilities',
      filter: ['==', ['get', 'powderlineType'], 'lift'],
      paint: {
        'line-color': ['case', ['==', ['get', 'id'], state.selectedLiftId || ''], '#2563eb', '#f97316'],
        'line-width': ['case',
          ['==', ['get', 'id'], state.selectedLiftId || ''],
          ['interpolate', ['linear'], ['zoom'], 9, 7.5, 13, 11, 16, 14.5],
          ['interpolate', ['linear'], ['zoom'], 9, 5.0, 13, 7.0, 16, 9.5]
        ],
        'line-opacity': 1.0
      }
    });

    // 3. Lift Label (선택된 리프트 위에만 이름 표시)
    map.addLayer({
      id: 'ski-lifts-label',
      type: 'symbol',
      source: 'ski-facilities',
      filter: ['all', ['==', ['get', 'powderlineType'], 'lift'], ['==', ['get', 'id'], state.selectedLiftId || '']],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name'], ''],
        'text-size': 12,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-offset': [0, -1],
        'text-anchor': 'bottom',
        'text-keep-upright': true
      },
      paint: {
        'text-color': '#1e40af',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2.5
      }
    });

    // 4. Hit area for click interactions (투명 인터랙션 레이어)
    map.addLayer({
      id: 'ski-lifts',
      type: 'line',
      source: 'ski-facilities',
      filter: ['==', ['get', 'powderlineType'], 'lift'],
      paint: {
        'line-color': 'transparent',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 8, 14, 16]
      }
    });

    // 5. Lift Towers (고배율 확대 zoom >= 14.5 시에만 은은한 최소 지주 표시)
    map.addLayer({
      id: 'ski-lift-towers',
      type: 'circle',
      source: 'ski-lift-towers',
      minzoom: 14.5,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14.5, 2, 16, 3],
        'circle-color': ['case', ['==', ['get', 'liftId'], state.selectedLiftId || ''], '#3b82f6', '#78716c'],
        'circle-stroke-color': '#1c1917',
        'circle-stroke-width': 1,
        'circle-opacity': 0.85
      }
    });

    // 6. Lift Terminals (탑승장 / 하차장에만 작고 단정한 아이콘 표시)
    map.addLayer({
      id: 'ski-lift-terminals',
      type: 'circle',
      source: 'ski-lift-terminals',
      minzoom: 10.0,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4, 16, 6],
        'circle-color': ['match', ['get', 'role'], 'dropoff', '#dc2626', '#16a34a'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5
      }
    });
  }
  function addRouteLayers() {
    map.addSource('route', { type: 'geojson', data: emptyCollection });
    map.addLayer({ id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': ['coalesce', ['get', 'glowColor'], '#14211f'], 'line-width': ['case', ['==', ['get', 'selected'], true], 8, 6], 'line-opacity': 0.35, 'line-blur': 2 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': ['coalesce', ['get', 'color'], '#ff0000'], 'line-width': ['case', ['==', ['get', 'selected'], true], 4, 3], 'line-opacity': 1 } });
    map.addSource('route-midpoints', { type: 'geojson', data: emptyCollection });
    map.addLayer({ id: 'route-midpoints', type: 'circle', source: 'route-midpoints', paint: { 'circle-radius': 4, 'circle-color': '#f5f6f1', 'circle-stroke-color': '#789012', 'circle-stroke-width': 2 } });
    map.addSource('route-points', { type: 'geojson', data: emptyCollection });
    map.addLayer({ id: 'route-points', type: 'circle', source: 'route-points', paint: { 'circle-radius': ['case', ['has', 'color'], 6, ['==', ['get', 'selected'], true], 7, 5], 'circle-color': ['case', ['has', 'color'], ['get', 'color'], ['==', ['get', 'selected'], true], '#ff9d2e', '#d8ff43'], 'circle-stroke-color': '#14211f', 'circle-stroke-width': 2 } });
  }
  function restoreLayerVisibility() { setLayerVisibility(['ski-lifts-casing', 'ski-lifts-line', 'ski-lifts-label', 'ski-lifts', 'ski-lift-towers', 'ski-lift-terminals'], $('#liftsToggle').checked); setLayerVisibility(['ski-runs'], $('#runsToggle').checked); setLayerVisibility(['route-glow', 'route-line', 'route-points', 'route-midpoints'], $('#gpxToggle').checked) }
  map.on('style.load', () => { if (!hasMapboxToken) { $('#mapStatus').textContent = t('mapStatusNeedToken'); return } $('#mapStatus').textContent = t('mapStatusLoading'); setTerrain(); addSkiLayers(); addRouteLayers(); loadSkiData($('#region').value); render(); restoreLayerVisibility() });
  map.on('sourcedata', e => { if (e.sourceId === 'mapbox-dem' && e.isSourceLoaded) { $('#mapStatus').textContent = t('mapStatusReady'); if (profile.pending) scheduleProfile(80) } });
  map.on('idle', () => { if (profile.pending) scheduleProfile(0) });
  map.on('error', e => { if (e.sourceId === 'mapbox-dem') $('#mapStatus').textContent = t('mapStatusDemUnavailable') });
  function setMapStyle(style) { if (!hasMapboxToken) return toast(t('toastNeedToken')); state.mapStyle = style; const topo = style === 'topo'; $('#satelliteBtn').classList.toggle('active', !topo); $('#topoBtn').classList.toggle('active', topo); $('#satelliteBtn').setAttribute('aria-pressed', String(!topo)); $('#topoBtn').setAttribute('aria-pressed', String(topo)); map.setStyle(MAPBOX_STYLES[style]); toast(topo ? t('toastStyleTopo') : t('toastStyleSatellite')) }
  async function loadSkiData(region) {
    const token = ++skiLoadToken; updateFacilityStatus('loading'); try {
      const response = await fetch(new URL(`./data/ski/${region}.geojson`, document.baseURI)); if (!response.ok) throw new Error(String(response.status)); const data = await response.json(); if (token !== skiLoadToken) return; const source = map.getSource('ski-facilities'); if (!source) return; source.setData(data); const c = data.metadata?.counts || {};
      updateFacilityStatus(data.metadata?.status === 'available' ? 'available' : 'unavailable', c);
      const liftFeatures = (data.features || []).filter(f => f.properties?.powderlineType === 'lift');
      const decorations = buildLiftDecorations(liftFeatures);
      map.getSource('ski-lift-towers')?.setData(decorations.towers);
      map.getSource('ski-lift-terminals')?.setData(decorations.terminals);
    } catch (error) {
      if (token !== skiLoadToken) return;
      map.getSource('ski-facilities')?.setData(emptyCollection);
      map.getSource('ski-lift-towers')?.setData(emptyCollection);
      map.getSource('ski-lift-terminals')?.setData(emptyCollection);
      updateFacilityStatus('unavailable');
      console.warn('Ski data error', error);
    }
  }
  function setLayerVisibility(ids, visible) { ids.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') }) }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])) }
  function localizedLiftType(value) { const typesKo = { gondola: '곤돌라', chair_lift: '체어리프트', chairlift: '체어리프트', drag_lift: '견인식 리프트', 't-bar': 'T바 리프트', 'j-bar': 'J바 리프트', platter: '플래터 리프트', rope_tow: '로프 토', cable_car: '케이블카', mixed_lift: '혼합형 리프트', magic_carpet: '무빙워크' }; const typesEn = { gondola: 'Gondola', chair_lift: 'Chairlift', chairlift: 'Chairlift', drag_lift: 'Drag Lift', 't-bar': 'T-Bar', 'j-bar': 'J-Bar', platter: 'Platter', rope_tow: 'Rope Tow', cable_car: 'Cable Car', mixed_lift: 'Mixed Lift', magic_carpet: 'Magic Carpet' }; const val = String(value || '').toLowerCase(); const dict = state.lang === 'en' ? typesEn : typesKo; return dict[val] || value || t('liftTypeUnknown') }
  function updateLiftSelection(liftId) {
    state.selectedLiftId = liftId;
    if (map.getLayer('ski-lifts-casing')) {
      map.setPaintProperty('ski-lifts-casing', 'line-color', ['case', ['==', ['get', 'id'], state.selectedLiftId || ''], '#1e3a8a', '#1c1917']);
      map.setPaintProperty('ski-lifts-casing', 'line-width', [
        'case',
        ['==', ['get', 'id'], state.selectedLiftId || ''],
        ['interpolate', ['linear'], ['zoom'], 9, 10, 13, 14, 16, 18],
        ['interpolate', ['linear'], ['zoom'], 9, 7.0, 13, 9.5, 16, 12.5]
      ]);
    }
    if (map.getLayer('ski-lifts-line')) {
      map.setPaintProperty('ski-lifts-line', 'line-color', ['case', ['==', ['get', 'id'], state.selectedLiftId || ''], '#2563eb', '#f97316']);
      map.setPaintProperty('ski-lifts-line', 'line-width', [
        'case',
        ['==', ['get', 'id'], state.selectedLiftId || ''],
        ['interpolate', ['linear'], ['zoom'], 9, 7.5, 13, 11, 16, 14.5],
        ['interpolate', ['linear'], ['zoom'], 9, 5.0, 13, 7.0, 16, 9.5]
      ]);
    }
    if (map.getLayer('ski-lifts-label')) {
      map.setFilter('ski-lifts-label', ['all', ['==', ['get', 'powderlineType'], 'lift'], ['==', ['get', 'id'], state.selectedLiftId || '']]);
    }
    if (map.getLayer('ski-lift-towers')) {
      map.setPaintProperty('ski-lift-towers', 'circle-color', ['case', ['==', ['get', 'liftId'], state.selectedLiftId || ''], '#3b82f6', '#78716c']);
    }
  }

  function showLiftPopup(p, lngLat) {
    const liftId = p.id || p.liftId || '';
    updateLiftSelection(liftId);
    const popup = new mapboxgl.Popup()
      .setLngLat(lngLat)
      .setHTML('<div class="ski-popup"><strong>' + escapeHtml(p.name || p.liftName || t('unnamedLift')) + '</strong><span>' + escapeHtml(t('liftPopupType')) + ': ' + escapeHtml(localizedLiftType(p.liftType)) + '</span>' + (p.label ? '<div style="margin-top:4px;color:#d97706;font-size:11px;">● ' + escapeHtml(p.label) + '</div>' : '') + '</div>')
      .addTo(map);

    popup.on('close', () => {
      updateLiftSelection(null);
    });
  }

  map.on('click', 'ski-lifts', event => {
    const p = event.features?.[0]?.properties;
    if (!p) return;
    showLiftPopup(p, event.lngLat);
  });
  map.on('click', 'ski-lift-terminals', event => {
    const p = event.features?.[0]?.properties;
    if (!p) return;
    showLiftPopup(p, event.lngLat);
  });
  map.on('click', 'ski-lift-towers', event => {
    const p = event.features?.[0]?.properties;
    if (!p) return;
    showLiftPopup(p, event.lngLat);
  });

  ['ski-lifts', 'ski-lift-terminals', 'ski-lift-towers'].forEach(layerId => {
    map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
  });

  function getActiveCourse() {
    if (!state.courses.length) {
      const id = 'course-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const r = regions[$('#region').value];
      const dateStr = state.lang === 'ko' ? new Date().toLocaleDateString('ko-KR') : new Date().toLocaleDateString('en-CA');
      const name = t('routeDefaultName', r.label, dateStr);
      const newCourse = { id, name, points: state.points ? [...state.points] : [], saved: false };
      state.courses = [newCourse];
      state.selectedCourseId = id;
      return newCourse;
    }
    let c = state.courses.find(item => item.id === state.selectedCourseId);
    if (!c) {
      c = state.courses[0];
      state.selectedCourseId = c.id;
    }
    return c;
  }

  function syncActiveCoursePoints() {
    const c = getActiveCourse();
    if (c) {
      c.points = [...state.points];
      c.isDirty = true;
    }
  }

  function pushHistory() {
    editHistory.past.push({
      courses: JSON.parse(JSON.stringify(state.courses)),
      selectedCourseId: state.selectedCourseId,
      points: JSON.parse(JSON.stringify(state.points)),
      selectedVertex: state.selectedVertex,
      mobileRoutePointsHidden,
      tool: state.tool
    });
    if (editHistory.past.length > editHistory.limit) editHistory.past.shift();
    editHistory.future = [];
    updateUndoRedoUI();
  }

  function undo() {
    if (!editHistory.past.length) return;
    editHistory.future.push({
      courses: JSON.parse(JSON.stringify(state.courses)),
      selectedCourseId: state.selectedCourseId,
      points: JSON.parse(JSON.stringify(state.points)),
      selectedVertex: state.selectedVertex,
      mobileRoutePointsHidden,
      tool: state.tool
    });
    const prev = editHistory.past.pop();
    state.courses = prev.courses;
    state.selectedCourseId = prev.selectedCourseId;
    state.points = prev.points;
    state.selectedVertex = prev.selectedVertex;
    if (window.matchMedia('(max-width: 768px)').matches) { mobileRoutePointsHidden = Boolean(prev.mobileRoutePointsHidden); setEditorTool(prev.tool || 'draw'); }
    const current = getActiveCourse();
    if (current) { $('#courseName').value = current.name; const mobileName = $('#mobileEditorCourseName'); if (mobileName) { mobileName.value = current.name; mobileName.dataset.historyRecorded = 'false'; } }
    renderCourseWorkList();
    render();
    updateUndoRedoUI();
    toast(t('toastUndo'));
  }

  function redo() {
    if (!editHistory.future.length) return;
    editHistory.past.push({
      courses: JSON.parse(JSON.stringify(state.courses)),
      selectedCourseId: state.selectedCourseId,
      points: JSON.parse(JSON.stringify(state.points)),
      selectedVertex: state.selectedVertex,
      mobileRoutePointsHidden,
      tool: state.tool
    });
    const next = editHistory.future.pop();
    state.courses = next.courses;
    state.selectedCourseId = next.selectedCourseId;
    state.points = next.points;
    state.selectedVertex = next.selectedVertex;
    if (window.matchMedia('(max-width: 768px)').matches) { mobileRoutePointsHidden = Boolean(next.mobileRoutePointsHidden); setEditorTool(next.tool || 'draw'); }
    const current = getActiveCourse();
    if (current) { $('#courseName').value = current.name; const mobileName = $('#mobileEditorCourseName'); if (mobileName) { mobileName.value = current.name; mobileName.dataset.historyRecorded = 'false'; } }
    renderCourseWorkList();
    render();
    updateUndoRedoUI();
    toast(t('toastRedo'));
  }

  function updateUndoRedoUI() {
    $('#undoBtn').disabled = !editHistory.past.length;
    $('#redoBtn').disabled = !editHistory.future.length;
    const mobileUndo = $('#mobileEditorUndoBtn');
    if (mobileUndo) mobileUndo.disabled = !editHistory.past.length;
  }

  function setEditorTool(tool) {
    state.tool = tool;
    document.querySelectorAll('.tool-grid button').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    for (const [id, name] of [['#mobileToolDraw', 'draw'], ['#mobileToolEdit', 'edit'], ['#mobileToolCut', 'cut'], ['#mobileToolDeleteSegment', 'delete-segment']]) {
      const button = $(id);
      if (button) { button.classList.toggle('active', name === tool); button.setAttribute('aria-pressed', String(name === tool)); }
    }
    state.segmentStart = null;
    const el = $('#editorStatus');
    if (!el) return;
    if (tool === 'draw') el.textContent = t('statusDrawTip');
    else if (tool === 'edit') el.textContent = t('statusEditTip');
    else if (tool === 'cut') el.textContent = t('statusCutTip');
    else if (tool === 'delete-segment') el.textContent = t('statusDeleteSegTip');
    else el.textContent = t('editorStatusDefault');
  }

  function openCourseEditor() {
    state.editorMode = true;
    if (window.matchMedia('(max-width: 768px)').matches) { mobileRoutePointsHidden = false; }
    $('#courseEditor').hidden = false;
    $('#drawBtn').hidden = true;
    $('.map-panel').classList.add('course-editing');
    editHistory.initialSnapshot = JSON.stringify(state.courses);
    if (!state.courses.length) {
      const r = regions[$('#region').value];
      const dateStr = state.lang === 'ko' ? new Date().toLocaleDateString('ko-KR') : new Date().toLocaleDateString('en-CA');
      const id = 'course-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const initialName = t('routeDefaultName', r.label, dateStr);
      state.courses = [{ id, name: initialName, points: [...state.points], saved: false }];
      state.selectedCourseId = id;
      $('#courseName').value = initialName;
    } else {
      const cur = getActiveCourse();
      state.points = [...cur.points];
      $('#courseName').value = cur.name;
    }
    setEditorTool('draw');
    renderCourseWorkList();
    updateUndoRedoUI();
    render();
    if (window.matchMedia('(max-width: 768px)').matches) setMobileAppView('course-editor');
  }

  function closeCourseEditor(discard = false) {
    if (discard && editHistory.initialSnapshot) {
      try {
        state.courses = JSON.parse(editHistory.initialSnapshot);
        const cur = getActiveCourse();
        state.points = cur ? [...cur.points] : [];
      } catch (e) { }
    }
    state.editorMode = false;
    state.selectedVertex = null;
    state.segmentStart = null;
    $('#courseEditor').hidden = true;
    $('#drawBtn').hidden = false;
    $('.map-panel').classList.remove('course-editing');
    render();
    mobileEditingSavedRoute = null;
    if (window.matchMedia('(max-width: 768px)').matches) setMobileAppView('routes');
  }

  function requestCloseCourseEditor() {
    const isDirty = state.courses.some(c => c.isDirty || (!c.saved && c.points.length > 0));
    if (isDirty) {
      $('#confirmModal').hidden = false;
    } else {
      closeCourseEditor(false);
    }
  }

  function renderCourseWorkList() {
    const list = $('#courseWorkList');
    if (!list) return;
    list.innerHTML = state.courses.map(c => {
      const km = distanceKm(c.points).toFixed(1);
      const active = c.id === state.selectedCourseId ? 'active' : '';
      return '<button class="course-item ' + active + '" type="button" data-id="' + c.id + '"><span>' + escapeHtml(c.name) + '</span><small>' + km + ' km · ' + c.points.length + 'pt</small></button>';
    }).join('');
    const mobileWorkSelect = $('#mobileEditorWorkingCourseSelect');
    const mobileWorkRow = $('#mobileEditorWorkCourseRow');
    if (mobileWorkSelect && mobileWorkRow) {
      mobileWorkRow.hidden = state.courses.length < 2;
      mobileWorkSelect.innerHTML = state.courses.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} · ${distanceKm(c.points).toFixed(1)} km</option>`).join('');
      mobileWorkSelect.value = state.selectedCourseId || '';
    }
    list.querySelectorAll('.course-item').forEach(b => {
      b.addEventListener('click', () => {
        const targetId = b.dataset.id;
        if (state.selectedCourseId === targetId) return;
        syncActiveCoursePoints();
        state.selectedCourseId = targetId;
        const c = getActiveCourse();
        state.points = [...c.points];
        state.selectedVertex = null;
        $('#courseName').value = c.name;
        const mobileName = $('#mobileEditorCourseName');
        if (mobileName) mobileName.value = c.name;
        renderCourseWorkList();
        render();
      });
    });
  }

  function feature(points, selected = true, color = null, glowColor = null) {
    const props = { selected };
    if (color) props.color = color;
    if (glowColor) props.glowColor = glowColor;
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: points.map(p => [p.lng, p.lat]) }, properties: props };
  }

  function render() {
    const routeSource = map.getSource('route'), pointSource = map.getSource('route-points');
    if (!routeSource || !pointSource) return;
    const lineFeatures = [];
    if (splitState && splitState.partA.length > 1 && splitState.partB.length > 1) {
      lineFeatures.push(feature(splitState.partA, true, '#38bdf8', 'rgba(56,189,248,0.5)'));
      lineFeatures.push(feature(splitState.partB, true, '#f59e0b', 'rgba(245,158,11,0.5)'));
    } else if (state.editorMode && state.courses.length) {
      for (const c of state.courses) {
        if (window.matchMedia('(max-width: 768px)').matches && c.id !== state.selectedCourseId) continue;
        if (c.points.length > 1) {
          lineFeatures.push(feature(c.points, c.id === state.selectedCourseId));
        }
      }
    } else if (state.points.length > 1) {
      lineFeatures.push(feature(state.points, true));
    }
    routeSource.setData({ type: 'FeatureCollection', features: lineFeatures });

    const showEditorPoints = state.editorMode && !(window.matchMedia('(max-width: 768px)').matches && mobileRoutePointsHidden);
    const pointFeatures = (showEditorPoints ? state.points : []).map((p, i) => {
      let ptColor = null;
      let isSelected = state.editorMode && (state.selectedVertex === i || (state.tool === 'delete-segment' && state.segmentStart === i));
      if (splitState) {
        if (i < splitState.splitIndex) {
          ptColor = '#38bdf8';
        } else if (i === splitState.splitIndex) {
          ptColor = '#ffffff';
          isSelected = true;
        } else {
          ptColor = '#f59e0b';
        }
      }
      const props = { i, selected: isSelected };
      if (ptColor) props.color = ptColor;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: props
      };
    });
    pointSource.setData({ type: 'FeatureCollection', features: pointFeatures });

    $('#points').textContent = state.points.length;
    const curKm = distanceKm(state.points);
    const mEditorStats = $('#mobileEditorStatsText');
    if (mEditorStats) mEditorStats.textContent = curKm.toFixed(1) + ' km · ' + state.points.length + 'pt';
    $('#distance').textContent = curKm.toFixed(1) + ' km';
    const mobileDistEl = $('#mobileDistVal');
    if (mobileDistEl) mobileDistEl.textContent = curKm.toFixed(1);
    const mobileCourseNameEl = $('#mobileCourseNameDisplay');
    if (mobileCourseNameEl) {
      const curCourse = (typeof getActiveCourse === 'function') ? getActiveCourse() : null;
      mobileCourseNameEl.textContent = (curCourse && curCourse.name) ? curCourse.name : t('brandSubtitle');
    }
    scheduleProfile();
  }

  function distanceKm(ps) { let d = 0; for (let i = 1; i < ps.length; i++) { const a = ps[i - 1], b = ps[i], r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; d += 6371 * Math.sqrt(x * x + y * y) } return d }
  function horizontalMeters(a, b) { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return 6371000 * Math.sqrt(x * x + y * y) }
  function resetProfile(message) { profile.samples = []; profile.layout = null; profile.pending = false; clearTimeout(profile.timer); $('#profileMessage').textContent = message; $('#profileMessage').hidden = false; $('#profileTooltip').hidden = true;['#profileDistance', '#profileAscent', '#profileDescent', '#profileAverage', '#profileMaximum'].forEach(id => $(id).textContent = '—'); const canvas = $('#profileChart'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); if (profile.marker) { profile.marker.remove(); profile.marker = null } renderMobileCourseProfiles() }
  function routeSamples() { if (state.points.length < 2) return []; const samples = [{ ...state.points[0], distance: 0 }], totalBySegment = []; let total = 0; for (let i = 1; i < state.points.length; i++) { const a = state.points[i - 1], b = state.points[i], length = horizontalMeters(a, b), steps = Math.max(1, Math.round(length / PROFILE_SAMPLE_METERS)); totalBySegment.push({ a, b, length, start: total, steps }); total += length } for (const segment of totalBySegment) { for (let step = 1; step <= segment.steps; step++) { const t = step / segment.steps; samples.push({ lng: segment.a.lng + (segment.b.lng - segment.a.lng) * t, lat: segment.a.lat + (segment.b.lat - segment.a.lat) * t, distance: segment.start + segment.length * t }) } } return samples }
  function scheduleProfile(delay = 180) { const generation = ++profile.generation; clearTimeout(profile.timer); if (state.points.length < 2) { resetProfile(t('profileEmptyMsg')); return } resetProfile(t('profileWaitingDem')); profile.pending = true; profile.timer = setTimeout(() => calculateProfile(generation), delay) }
  function calculateProfile(generation) {
    if (generation !== profile.generation || state.points.length < 2) return; const samples = routeSamples(), total = samples.at(-1)?.distance || 0; if (total < .01) { resetProfile(t('profileNeed2Points')); return } let missing = false; for (const sample of samples) { let elevation; try { elevation = map.queryTerrainElevation([sample.lng, sample.lat], { exaggerated: false }) } catch (error) { elevation = null } if (!Number.isFinite(elevation)) { missing = true; break } sample.elevation = elevation } if (generation !== profile.generation) return; if (missing) { profile.pending = true; $('#profileMessage').textContent = t('profileWaitingTiles'); $('#profileMessage').hidden = false; return } profile.pending = false; let ascent = 0, descent = 0, weightedSlope = 0, maxSlope = 0; for (let i = 1; i < samples.length; i++) { const horizontal = samples[i].distance - samples[i - 1].distance, elevationChange = samples[i].elevation - samples[i - 1].elevation, slope = Math.atan2(elevationChange, horizontal) * 180 / Math.PI; samples[i].slope = slope; if (elevationChange > 0) ascent += elevationChange; else descent -= elevationChange; weightedSlope += Math.abs(slope) * horizontal; maxSlope = Math.max(maxSlope, Math.abs(slope)) } samples[0].slope = 0; profile.samples = samples; $('#profileDistance').textContent = (total / 1000).toFixed(2) + ' km'; $('#profileAscent').textContent = Math.round(ascent) + ' m'; $('#profileDescent').textContent = Math.round(descent) + ' m'; $('#profileAverage').textContent = (weightedSlope / total).toFixed(1) + '°';
    const mobileSlopeEl = $('#mobileSlopeVal');
    if (mobileSlopeEl) mobileSlopeEl.textContent = (weightedSlope / total).toFixed(0); $('#profileMaximum').textContent = maxSlope.toFixed(1) + '°'; $('#descent').textContent = Math.round(descent) + ' m'; $('#profileMessage').hidden = true; drawProfile(); renderMobileCourseProfiles()
  }
  function drawProfile() { const samples = profile.samples, canvas = $('#profileChart'); if (!samples.length || !canvas.clientWidth || !canvas.clientHeight) return; const width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const pad = { left: 42, right: 12, top: 8, bottom: 23 }, plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom, total = samples.at(-1).distance, range = samples.reduce((result, sample) => ({ min: Math.min(result.min, sample.elevation), max: Math.max(result.max, sample.elevation) }), { min: Infinity, max: -Infinity }), elevationPad = Math.max(5, (range.max - range.min) * .08), min = range.min - elevationPad, max = range.max + elevationPad, xFor = distance => pad.left + (distance / total) * plotWidth, yFor = elevation => pad.top + (max - elevation) / (max - min) * plotHeight; profile.layout = { pad, plotWidth, total, xFor }; ctx.clearRect(0, 0, width, height); ctx.strokeStyle = 'rgba(20,33,31,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, height - pad.bottom); ctx.lineTo(width - pad.right, height - pad.bottom); ctx.stroke(); ctx.fillStyle = '#73817e'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'right'; ctx.fillText(Math.round(max) + ' m', pad.left - 5, pad.top + 7); ctx.fillText(Math.round(min) + ' m', pad.left - 5, height - pad.bottom); ctx.textAlign = 'left'; ctx.fillText('0 km', pad.left, height - 5); ctx.textAlign = 'right'; ctx.fillText((total / 1000).toFixed(2) + ' km', width - pad.right, height - 5); ctx.beginPath(); samples.forEach((sample, index) => { const x = xFor(sample.distance), y = yFor(sample.elevation); if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }); ctx.lineTo(width - pad.right, height - pad.bottom); ctx.lineTo(pad.left, height - pad.bottom); ctx.closePath(); ctx.fillStyle = 'rgba(120,144,18,.16)'; ctx.fill(); ctx.beginPath(); samples.forEach((sample, index) => { const x = xFor(sample.distance), y = yFor(sample.elevation); if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }); ctx.strokeStyle = '#789012'; ctx.lineWidth = 2; ctx.stroke() }
  function inspectProfile(event) { if (!profile.samples.length || !profile.layout) return; event.preventDefault(); const canvas = $('#profileChart'), rect = canvas.getBoundingClientRect(), localX = Math.max(profile.layout.pad.left, Math.min(rect.width - profile.layout.pad.right, event.clientX - rect.left)), target = (localX - profile.layout.pad.left) / profile.layout.plotWidth * profile.layout.total; let low = 0, high = profile.samples.length - 1; while (low < high) { const mid = Math.floor((low + high) / 2); if (profile.samples[mid].distance < target) low = mid + 1; else high = mid } const next = profile.samples[low], previous = profile.samples[Math.max(0, low - 1)], sample = Math.abs(next.distance - target) < Math.abs(previous.distance - target) ? next : previous, tooltip = $('#profileTooltip'); tooltip.textContent = `${(sample.distance / 1000).toFixed(2)} km · ${Math.round(sample.elevation)} m · ${sample.slope >= 0 ? '+' : ''}${sample.slope.toFixed(1)}°`; tooltip.style.left = profile.layout.xFor(sample.distance) + 'px'; tooltip.style.top = '58px'; tooltip.hidden = false; if (!profile.marker) profile.marker = new mapboxgl.Marker({ color: '#d8ff43', scale: .75 }).addTo(map); profile.marker.setLngLat([sample.lng, sample.lat]) }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2500) }
  function setRegion() { const region = $('#region').value, r = regions[region]; map.flyTo({ center: r.center, zoom: r.zoom, bearing: r.bearing, pitch: r.pitch, duration: 1400 }); loadSkiData(region); clearLine(); toast(t('toastRegionMoved', r.label)) }
  function clearLine() {
    pushHistory();
    state.points = [];
    state.selectedVertex = null;
    syncActiveCoursePoints();
    renderCourseWorkList();
    render();
  }

  // Map Click Interactions
  map.on('click', e => {
    if (!state.editorMode) return;
    if (state.tool === 'draw') {
      if (map.getLayer('route-points') && map.queryRenderedFeatures(e.point, { layers: ['route-points'] }).length) return;
      pushHistory();
      state.points.push({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      state.selectedVertex = state.points.length - 1;
      syncActiveCoursePoints();
      renderCourseWorkList();
      render();
    }
  });

  // Vertex Click & Drag Handling (Mouse & Touch)
  function setupVertexInteractions() {
    let isDragging = false;
    let dragIndex = null;

    function onDown(e) {
      if (!state.editorMode || !state.points.length) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['route-points'] });
      if (!features.length) return;
      const i = Number(features[0].properties.i);
      if (!Number.isInteger(i)) return;

      if (state.tool === 'cut') {
        e.preventDefault();
        if (i <= 0 || i >= state.points.length - 1) {
          toast(state.lang === 'ko' ? '시작점이나 끝점은 나눌 수 없습니다. 중간 포인트를 선택하세요.' : t('toastCourseCutNeedPoints'));
          return;
        }
        splitState = {
          splitIndex: i,
          partA: state.points.slice(0, i + 1),
          partB: state.points.slice(i)
        };
        state.selectedVertex = i;
        showSplitHUD();
        render();
        toast(state.lang === 'ko' ? '경로가 구간 A(하늘색)와 구간 B(주황색)로 분할되었습니다. 삭제할 구간을 선택하세요.' : 'Route split into Segment A and B. Select a segment to delete.');
        return;
      }

      if (state.tool === 'delete-segment') {
        e.preventDefault();
        if (state.segmentStart === null) {
          state.segmentStart = i;
          state.selectedVertex = i;
          render();
          $('#editorStatus').textContent = t('statusSelectSecondPoint');
          if (window.matchMedia('(max-width: 768px)').matches) toast(t('statusSelectSecondPoint'));
          return;
        } else {
          const p1 = state.segmentStart;
          const p2 = i;
          state.segmentStart = null;
          if (p1 === p2) {
            render();
            $('#editorStatus').textContent = t('statusDeleteSegTip');
            return;
          }
          pushHistory();
          const minIdx = Math.min(p1, p2);
          const maxIdx = Math.max(p1, p2);
          state.points.splice(minIdx, maxIdx - minIdx + 1);
          state.selectedVertex = null;
          syncActiveCoursePoints();
          renderCourseWorkList();
          render();
          $('#editorStatus').textContent = t('statusDeleteSegTip');
          toast(t('toastSegmentDeleted'));
          return;
        }
      }

      // Default or edit mode: Select & Drag
      e.preventDefault();
      state.selectedVertex = i;
      render();
      isDragging = true;
      let dragHistorySaved = false;
      dragIndex = i;
      map.getCanvas().style.cursor = 'grabbing';
      map.dragPan.disable();

      function onMove(ev) {
        if (!isDragging || dragIndex === null) return;
        if (!dragHistorySaved) {
          const before = state.points[dragIndex];
          if (before.lng === ev.lngLat.lng && before.lat === ev.lngLat.lat) return;
          pushHistory();
          dragHistorySaved = true;
        }
        state.points[dragIndex] = { lng: ev.lngLat.lng, lat: ev.lngLat.lat };
        syncActiveCoursePoints();
        render();
      }

      function onUp() {
        isDragging = false;
        dragIndex = null;
        map.getCanvas().style.cursor = '';
        map.dragPan.enable();
        map.off('mousemove', onMove);
        map.off('touchmove', onMove);
        map.off('mouseup', onUp);
        map.off('touchend', onUp);
        renderCourseWorkList();
      }

      map.on('mousemove', onMove);
      map.on('touchmove', onMove);
      map.once('mouseup', onUp);
      map.once('touchend', onUp);
    }

    map.on('mousedown', 'route-points', onDown);
    map.on('touchstart', 'route-points', onDown);
  }

  setupVertexInteractions();

  function removeVertex(event) {
    if (!state.editorMode) return;
    event.preventDefault();
    event.originalEvent?.stopPropagation();
    const index = Number(event.features?.[0]?.properties?.i);
    if (Number.isInteger(index)) {
      pushHistory();
      state.points.splice(index, 1);
      if (state.selectedVertex === index) state.selectedVertex = null;
      else if (state.selectedVertex > index) state.selectedVertex--;
      syncActiveCoursePoints();
      renderCourseWorkList();
      render();
      toast(t('toastDeletedVertex'));
    }
  }

  map.on('contextmenu', 'route-points', removeVertex);
  map.on('dblclick', 'route-points', removeVertex);

  function gpxString() {
    const now = new Date().toISOString();
    const course = getActiveCourse();
    const courseName = course ? course.name : 'Powderline line';
    const trkpts = state.points.map(function (p) { return '<trkpt lat="' + p.lat + '" lon="' + p.lng + '"></trkpt>'; }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Powderline"><metadata><name>Powderline route</name><time>' + now + '</time></metadata><trk><name>' + escapeHtml(courseName) + '</name><trkseg>' + trkpts + '</trkseg></trk></gpx>';
  }

  $('#exportBtn').addEventListener('click', () => {
    if (state.points.length < 2) return toast(t('toastNeedRouteFirst'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpxString()], { type: 'application/gpx+xml' }));
    const cur = getActiveCourse();
    const fname = (cur?.name || 'powderline-route').replace(/[/\\?%*:|"<>]/g, '-');
    a.download = fname + '.gpx';
    a.click();
    toast(t('toastExportedGpx'));
  });

  $('#gpxInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const xml = new DOMParser().parseFromString(await f.text(), 'application/xml');
    const pts = [...xml.querySelectorAll('trkpt,rtept')].map(n => ({ lat: +n.getAttribute('lat'), lng: +n.getAttribute('lon') }));
    if (!pts.length) return;
    pushHistory();
    state.points = pts;
    state.selectedVertex = null;
    const name = xml.querySelector('trk>name,name')?.textContent?.trim() || f.name.replace(/\.gpx$/i, '');
    const cur = getActiveCourse();
    if (cur) {
      cur.name = name;
      cur.points = [...pts];
      cur.isDirty = true;
      $('#courseName').value = name;
      const mobileName = $('#mobileEditorCourseName');
      if (mobileName) mobileName.value = name;
    }
    renderCourseWorkList();
    render();
    if (document.body.dataset.mobileView === 'routes') openCourseEditor();
    if (state.points.length) {
      const bounds = state.points.reduce((b, p) => b.extend([p.lng, p.lat]), new mapboxgl.LngLatBounds([state.points[0].lng, state.points[0].lat], [state.points[0].lng, state.points[0].lat]));
      map.fitBounds(bounds, { padding: 90, duration: 900, maxZoom: 13 });
    }
    toast(t('toastImportedGpx', state.points.length));
  });

  function renderSaved() {
    const el = $('#savedList');
    $('#savedCount').textContent = state.saved.length;
    if (!state.saved.length) {
      el.innerHTML = '<p class="empty" data-i18n="emptySaved">' + t('emptySaved') + '</p>';
      return;
    }
    el.innerHTML = state.saved.map((r, i) => '<button class="saved-item" data-i="' + i + '"><span>' + escapeHtml(r.name) + '</span><small>' + r.km.toFixed(1) + ' km</small></button>').join('');
    renderMobileSavedRoutes();
    el.querySelectorAll('.saved-item').forEach(b => b.addEventListener('click', () => {
      const item = state.saved[+b.dataset.i];
      pushHistory();
      state.points = item.points.map(point => ({ ...point }));
      state.selectedVertex = null;
      const cur = getActiveCourse();
      if (cur) {
        cur.name = item.name;
        cur.points = [...state.points];
        cur.databaseId = item.source === 'cloud' ? item.id : null;
        $('#courseName').value = cur.name;
      }
      renderCourseWorkList();
      render();
      if (state.points.length) {
        const bounds = state.points.reduce((box, point) => box.extend([point.lng, point.lat]), new mapboxgl.LngLatBounds([state.points[0].lng, state.points[0].lat], [state.points[0].lng, state.points[0].lat]));
        map.fitBounds(bounds, { padding: 90, duration: 900, maxZoom: 13 });
      }
      toast(t('toastLoadedSaved'));
    }));
  }

  async function saveActiveCourse() {
    if (state.points.length < 2) {
      toast(t('toastNeedRouteFirst'));
      return false;
    }
    const cur = getActiveCourse();
    if (!cur) return false;
    const name = $('#courseName').value.trim() || cur.name;
    cur.name = name;
    cur.points = [...state.points];
    const km = distanceKm(state.points);
    const courseRegion = $('#region').value;

    if (supabaseClient && state.session?.user) {
      if (state.profile && state.profile.status !== 'approved') {
        toast(state.profile.status === 'rejected' ? t('toastRejectedNotice') : t('toastPendingNotice'));
        return false;
      }
      const payload = {
        user_id: state.session.user.id,
        name,
        region: $('#region').value,
        points: state.points.map(point => ({ lng: Number(point.lng), lat: Number(point.lat) })),
        distance_km: km,
        updated_at: new Date().toISOString()
      };
      let query;
      if (cur.databaseId) {
        query = supabaseClient.from('powderline_routes').update(payload).eq('id', cur.databaseId);
      } else {
        query = supabaseClient.from('powderline_routes').insert(payload);
      }
      const { data, error } = await query.select('id,name,region,points,distance_km,created_at,updated_at').single();
      if (error) {
        updateAuthUi(error.message);
        toast(error.message);
        return false;
      }
      cur.databaseId = data.id;
      const savedRoute = { id: data.id, name: data.name, region: data.region, km: Number(data.distance_km) || km, points: data.points, createdAt: data.created_at, updatedAt: data.updated_at, source: 'cloud' };
      state.saved = [savedRoute, ...state.saved.filter(route => route.id !== data.id)];
      toast(t('toastSavedCloud'));
    } else {
      const savedRoute = { name, region: courseRegion, km, points: state.points.map(point => ({ ...point })), source: 'local' };
      const previousIndex = state.saved.indexOf(mobileEditingSavedRoute);
      if (previousIndex >= 0) state.saved.splice(previousIndex, 1, savedRoute);
      else state.saved.unshift(savedRoute);
      localStorage.setItem('powderline.routes', JSON.stringify(state.saved));
      toast(t('toastSavedLocal'));
    }
    mobileEditingSavedRoute = null;
    cur.saved = true;
    cur.isDirty = false;
    renderSaved();
    renderCourseWorkList();
    return true;
  }

  async function deleteActiveCourse() {
    const cur = getActiveCourse();
    if (!cur) return;
    const confirmMsg = state.lang === 'ko' ? '이 코스를 삭제하시겠습니까?' : 'Are you sure you want to delete this course?';
    if (!window.confirm(confirmMsg)) return;

    if (cur.databaseId && supabaseClient && state.session?.user) {
      try {
        const { error } = await supabaseClient.from('powderline_routes').delete().eq('id', cur.databaseId);
        if (error) {
          toast(error.message);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (cur.databaseId) {
      state.saved = state.saved.filter(r => r.id !== cur.databaseId);
    } else if (mobileEditingSavedRoute) {
      state.saved = state.saved.filter(r => r !== mobileEditingSavedRoute);
    } else {
      state.saved = state.saved.filter(r => r.name !== cur.name);
    }
    localStorage.setItem('powderline.routes', JSON.stringify(state.saved.filter(r => r.source !== 'cloud')));
    renderSaved();
    renderMobileSavedRoutes();

    state.courses = state.courses.filter(c => c.id !== cur.id);
    mobileEditingSavedRoute = null;
    mobileSelectedSavedIndex = '';

    if (state.courses.length > 0) {
      state.selectedCourseId = state.courses[0].id;
      state.points = [...state.courses[0].points];
      $('#courseName').value = state.courses[0].name;
      const mInput = $('#mobileEditorCourseName');
      if (mInput) mInput.value = state.courses[0].name;
    } else {
      state.selectedCourseId = null;
      state.points = [];
      $('#courseName').value = '';
      const mInput = $('#mobileEditorCourseName');
      if (mInput) mInput.value = '';
    }

    renderCourseWorkList();
    render();
    closeCourseEditor(false);
    toast(state.lang === 'ko' ? '코스가 삭제되었습니다.' : 'Course deleted.');
  }

  $('#saveBtn').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try { await saveActiveCourse(); } finally { e.currentTarget.disabled = false; }
  });

  // Editor Event Listeners
  $('#drawBtn').addEventListener('click', () => {
    openCourseEditor();
  });

  $('#exitEditorBtn').addEventListener('click', () => {
    requestCloseCourseEditor();
  });

  $('#finishDrawBtn').addEventListener('click', () => {
    setEditorTool('edit');
    toast(t('toastDrawFinishTip'));
  });

  $('#courseName').addEventListener('input', e => {
    const cur = getActiveCourse();
    if (cur) {
      cur.name = e.target.value;
      cur.isDirty = true;
      renderCourseWorkList();
    }
  });

  $('#newCourseBtn').addEventListener('click', () => {
    syncActiveCoursePoints();
    pushHistory();
    const r = regions[$('#region').value];
    const dateStr = state.lang === 'ko' ? new Date().toLocaleDateString('ko-KR') : new Date().toLocaleDateString('en-CA');
    const count = state.courses.length + 1;
    const newName = t('routeDefaultName', r.label, dateStr) + ' (' + count + ')';
    const newId = 'course-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const newCourse = {
      id: newId,
      name: newName,
      points: [],
      saved: false
    };
    state.courses.push(newCourse);
    state.selectedCourseId = newId;
    state.points = [];
    state.selectedVertex = null;
    $('#courseName').value = newName;
    renderCourseWorkList();
    setEditorTool('draw');
    render();
  });

  document.querySelectorAll('.tool-grid button').forEach(b => {
    b.addEventListener('click', () => setEditorTool(b.dataset.tool));
  });

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);

  $('#deleteVertexBtn').addEventListener('click', () => {
    if (!state.points.length) return toast(t('toastNoPointsToDelete'));
    if (state.selectedVertex === null) return toast(t('toastSelectPointFirst'));
    pushHistory();
    state.points.splice(state.selectedVertex, 1);
    state.selectedVertex = null;
    syncActiveCoursePoints();
    renderCourseWorkList();
    render();
    toast(t('toastDeletedVertex'));
  });

  $('#clearBtn').addEventListener('click', clearLine);

  // Modal Event Listeners
  $('#modalCancelBtn').addEventListener('click', () => {
    $('#confirmModal').hidden = true;
  });

  $('#modalDiscardBtn').addEventListener('click', () => {
    $('#confirmModal').hidden = true;
    closeCourseEditor(true);
    toast(t('toastDiscardedChanges'));
  });

  $('#modalSaveBtn').addEventListener('click', async () => {
    $('#modalSaveBtn').disabled = true;
    try {
      if (await saveActiveCourse()) {
        $('#confirmModal').hidden = true;
        closeCourseEditor(false);
        toast(t('toastSavedAndClosed'));
      }
    } finally {
      $('#modalSaveBtn').disabled = false;
    }
  });

  $('#region').addEventListener('change', setRegion);
  $('#supabaseKey').value = localStorage.getItem(SUPABASE_KEY_STORAGE) || '';
  $('#applySupabaseKey').addEventListener('click', async e => {
    const key = $('#supabaseKey').value.trim();
    if (!isPublishableKey(key)) return toast(t('toastInvalidSupabaseKey'));
    e.currentTarget.disabled = true;
    try {
      localStorage.setItem(SUPABASE_KEY_STORAGE, key);
      if (await initializeSupabase(key)) toast(t('toastSupabaseConfigured'));
    } finally {
      e.currentTarget.disabled = false;
    }
  });
  $('#authForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!supabaseClient) return toast(t('authNeedKey'));
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    if (!email || !password) return;
    $('#loginBtn').disabled = true;
    updateAuthUi();
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    $('#loginBtn').disabled = false;
    if (error) {
      updateAuthUi(error.message);
      toast(error.message);
      return;
    }
    state.session = data?.session || null;
    $('#authPassword').value = '';
    updateAuthUi();
    toast(t('toastLoginSuccess'));
  });

  const SIGNUP_REQUEST_TIMEOUT_MS = 20000;
  function waitForSignupResponse(request) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(t('toastSignupTimeout'));
        error.name = 'SignupTimeoutError';
        reject(error);
      }, SIGNUP_REQUEST_TIMEOUT_MS);
    });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
  }

  const SIGNUP_FIELD_IDS = ['signupEmail', 'signupPassword', 'signupPasswordConfirm', 'signupNickname'];
  function setSignupFieldError(inputId, message = '') {
    const input = $('#' + inputId);
    if (!input) return;
    const errorId = inputId + 'Error';
    let error = $('#' + errorId);
    if (!error) {
      error = document.createElement('small');
      error.id = errorId;
      error.className = 'signup-field-error';
      error.setAttribute('aria-live', 'polite');
      input.insertAdjacentElement('afterend', error);
    }
    error.textContent = message;
    error.hidden = !message;
    input.classList.toggle('input-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    if (message) input.setAttribute('aria-describedby', errorId);
    else input.removeAttribute('aria-describedby');
  }

  function clearSignupErrors() {
    SIGNUP_FIELD_IDS.forEach(id => setSignupFieldError(id));
    const requestError = $('#signupRequestError');
    if (requestError) {
      requestError.textContent = '';
      requestError.hidden = true;
    }
  }

  function showSignupRequestError(message) {
    const form = $('#signupModalForm');
    if (form) {
      let error = $('#signupRequestError');
      if (!error) {
        error = document.createElement('p');
        error.id = 'signupRequestError';
        error.className = 'signup-request-error';
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        form.querySelector('.modal-actions')?.insertAdjacentElement('beforebegin', error);
      }
      error.textContent = message;
      error.hidden = false;
    }
    toast(message);
  }

  function openSignupModal() {
    const modal = $('#signupModal');
    if (!modal) return;
    const submitBtn = $('#submitSignupBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = t('btnSubmitSignup');
    }
    clearSignupErrors();
    $('#signupEmail').value = $('#authEmail')?.value.trim() || '';
    $('#signupPassword').value = '';
    $('#signupPasswordConfirm').value = '';
    $('#signupNickname').value = '';
    modal.hidden = false;
  }

  function closeSignupModal() {
    const modal = $('#signupModal');
    if (modal) modal.hidden = true;
  }

  $('#signupModalForm')?.setAttribute('novalidate', '');
  SIGNUP_FIELD_IDS.forEach(id => {
    $('#' + id)?.addEventListener('input', () => {
      setSignupFieldError(id);
      const requestError = $('#signupRequestError');
      if (requestError) requestError.hidden = true;
      if (id === 'signupPassword') setSignupFieldError('signupPasswordConfirm');
    });
  });

  $('#signupBtn')?.addEventListener('click', () => {
    openSignupModal();
  });

  $('#closeSignupModalBtn')?.addEventListener('click', () => {
    closeSignupModal();
  });

  $('#cancelSignupBtn')?.addEventListener('click', () => {
    closeSignupModal();
  });

  $('#signupModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSignupModal();
  });

  $('#signupModalForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!supabaseClient) {
      showSignupRequestError(t('authNeedKey'));
      return;
    }
    const email = $('#signupEmail').value.trim();
    const password = $('#signupPassword').value;
    const passwordConfirm = $('#signupPasswordConfirm').value;
    const nickname = $('#signupNickname').value.trim();

    clearSignupErrors();
    let firstInvalid = null;
    const invalidate = (id, message) => {
      setSignupFieldError(id, message);
      firstInvalid = firstInvalid || $('#' + id);
    };
    if (!email) invalidate('signupEmail', t('signupEmailRequired'));
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidate('signupEmail', t('signupEmailInvalid'));
    if (!password) invalidate('signupPassword', t('signupPasswordRequired'));
    else if (password.length < 6) invalidate('signupPassword', t('signupPasswordTooShort'));
    if (!passwordConfirm) invalidate('signupPasswordConfirm', t('signupPasswordConfirmRequired'));
    else if (password !== passwordConfirm) invalidate('signupPasswordConfirm', t('toastPasswordMismatch'));
    if (!nickname) invalidate('signupNickname', t('signupNicknameRequired'));
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const submitBtn = $('#submitSignupBtn');
    if (submitBtn?.disabled) return;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.textContent = t('btnSubmittingSignup');
    }
    try {
      const { data, error } = await waitForSignupResponse(supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { nickname }
        }
      }));
      if (error) {
        showSignupRequestError(error.message || t('toastSignupFailed'));
        return;
      }
      if (!data?.user) throw new Error(t('toastSignupFailed'));
      // Automatically sign out if Supabase created a session so user stays on clean login screen
      if (data?.session) {
        const { error: signOutError } = await supabaseClient.auth.signOut();
        if (signOutError) throw signOutError;
        state.session = null;
        state.profile = null;
        updateAuthUi();
      }
      closeSignupModal();
      // Fill email into login form for user convenience
      if ($('#authEmail')) $('#authEmail').value = email;
      if ($('#authPassword')) $('#authPassword').value = '';
      toast(t('toastSignupPending'));
    } catch (error) {
      console.error('Signup request failed:', error);
      showSignupRequestError(error?.name === 'SignupTimeoutError' ? t('toastSignupTimeout') : (error?.message || t('toastSignupFailed')));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        submitBtn.textContent = t('btnSubmitSignup');
      }
    }
  });
  $('#logoutBtn')?.addEventListener('click', async e => {
    if (!supabaseClient) return;
    e.currentTarget.disabled = true;
    const { error } = await supabaseClient.auth.signOut();
    e.currentTarget.disabled = false;
    if (error) {
      updateAuthUi(error.message);
      toast(error.message);
      return;
    }
    state.session = null;
    state.profile = null;
    state.pendingUsers = [];
    updateAuthUi();
    useLocalRoutes();
    toast(t('toastLogoutSuccess'));
  });
  $('#pendingList')?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const targetId = btn.dataset.id;
    const action = btn.dataset.action;
    btn.disabled = true;
    try {
      if (action === 'approve') {
        await handleSetUserStatus(targetId, 'approved');
      } else if (action === 'reject') {
        await handleSetUserStatus(targetId, 'rejected');
      }
    } finally {
      btn.disabled = false;
    }
  });
  $('#refreshAdminBtn')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try {
      await loadPendingUsers();
    } finally {
      e.currentTarget.disabled = false;
    }
  });
  $('#liftsToggle').addEventListener('change', e => setLayerVisibility(['ski-lifts-casing', 'ski-lifts-line', 'ski-lifts-label', 'ski-lifts', 'ski-lift-towers', 'ski-lift-terminals'], e.target.checked));
  $('#runsToggle').addEventListener('change', e => setLayerVisibility(['ski-runs'], e.target.checked));
  $('#gpxToggle').addEventListener('change', e => setLayerVisibility(['route-glow', 'route-line', 'route-points', 'route-midpoints'], e.target.checked));
  $('#satelliteBtn').addEventListener('click', () => setMapStyle('satellite'));
  $('#topoBtn').addEventListener('click', () => setMapStyle('topo'));
  $('#tiltBtn').addEventListener('click', () => map.easeTo({ pitch: map.getPitch() > 20 ? 15 : 58, duration: 700 }));
  $('#resetBtn').addEventListener('click', () => setRegion());

  $('#langKoBtn')?.addEventListener('click', () => setLanguage('ko'));
  $('#langEnBtn')?.addEventListener('click', () => setLanguage('en'));

  $('#profileToggle').addEventListener('click', () => {
    const collapsed = $('#profilePanel').classList.toggle('collapsed');
    $('.map-panel').classList.toggle('profile-open', !collapsed);
    $('#profileToggle').setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed) requestAnimationFrame(drawProfile);
  });
  $('#profileChart').addEventListener('pointermove', inspectProfile);
  $('#profileChart').addEventListener('pointerdown', inspectProfile);
  $('#profileChart').addEventListener('pointerleave', () => $('#profileTooltip').hidden = true);
  window.addEventListener('resize', () => requestAnimationFrame(drawProfile));

  setLanguage(state.lang);
  resetProfile(t('profileEmptyMsg'));

  // ==========================================================================
  // Mobile Stitch HUD Interactive Event Bindings
  // ==========================================================================
  function renderMobileMapCourses({ reset = false } = {}) {
    const select = $('#mobileMapCourseSelect');
    if (!select) return;
    const region = $('#region').value;
    const previous = reset ? '' : select.value;
    const routes = state.saved.map((route, index) => ({ route, index }))
      .filter(({ route }) => !route.region || route.region === region);
    select.innerHTML = '<option value="">코스 미선택</option>' + routes.map(({ route, index }) =>
      `<option value="${index}">${escapeHtml(route.name)} · ${Number(route.km || 0).toFixed(1)} km</option>`
    ).join('');
    select.value = routes.some(({ index }) => String(index) === previous) ? previous : '';
  }

  function initMobileHud() {
    const mobileMedia = window.matchMedia('(max-width: 768px)');
    const profilePanel = $('#profilePanel');
    const mapPanel = $('.map-panel');
    const partyPanel = $('#mobilePartyPanel');
    const accountScreen = $('#mobileAccountScreen');
    const panelTitle = $('#mobilePanelTitle');
    const sidebar = $('.sidebar');
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    let mobileMode = false;
    let desktopProfileCollapsed = false;

    function showMobileView(view) {
      if (!mobileMedia.matches) return;
      const nextView = ['home', 'map', 'ride', 'routes', 'course-editor', 'party', 'party-create', 'party-leader', 'party-invite', 'party-joined', 'party-received', 'account'].includes(view) ? view : 'map';
      const activeTab = nextView === 'course-editor' ? 'routes' : ['party-create', 'party-leader', 'party-invite', 'party-joined', 'party-received'].includes(nextView) ? 'party' : nextView === 'ride' ? 'map' : nextView;
      document.body.dataset.mobileView = nextView;
      document.body.dataset.mobileTab = activeTab;
      mobileNavItems.forEach(item => item.classList.toggle('active', item.dataset.tab === activeTab));
      const homeScreen = $('#mobileHomeScreen');
      const routesScreen = $('#mobileRoutesScreen');
      const partyScreen = $('#mobilePartyScreen');
      const partyCreateScreen = $('#mobilePartyCreateScreen');
      const partyLeaderScreen = $('#mobilePartyLeaderScreen');
      const partyInviteScreen = $('#mobilePartyInviteScreen');
      const partyJoinedScreen = $('#mobilePartyJoinedScreen');
      const partyReceivedScreen = $('#mobilePartyReceivedScreen');
      const editorHud = $('#mobileCourseEditorHUD');
      const rideHud = $('#mobileRideHud');
      const mobileHud = $('#mobileHud');
      if (rideHud) rideHud.hidden = nextView !== 'ride';
      if (mobileHud) {
        mobileHud.hidden = nextView !== 'map';
        mobileHud.classList.toggle('mobile-hud-ride-hidden', nextView === 'ride');
      }
      if (homeScreen) homeScreen.hidden = nextView !== 'home';
      if (nextView === 'home' && typeof renderMobileHome === 'function') renderMobileHome();
      if (nextView === 'map') renderMobileMapCourses();
      if (routesScreen) routesScreen.hidden = nextView !== 'routes';
      if (partyScreen) partyScreen.hidden = nextView !== 'party';
      if (partyCreateScreen) partyCreateScreen.hidden = nextView !== 'party-create';
      if (nextView !== 'party-create') $('#partyCreateCourseModal').hidden = true;
      if (nextView === 'party-create') renderPartyCreateCourses();
      if (partyLeaderScreen) partyLeaderScreen.hidden = nextView !== 'party-leader';
      if (nextView === 'party-leader') renderPartyLeader();
      if (partyInviteScreen) partyInviteScreen.hidden = nextView !== 'party-invite';
      if (nextView === 'party-invite') renderPartyInviteResults();
      if (partyJoinedScreen) partyJoinedScreen.hidden = nextView !== 'party-joined';
      if (nextView === 'party-joined') renderPartyJoined();
      if (nextView !== 'party-joined') $('#partyJoinedLeaveModal').hidden = true;
      if (partyReceivedScreen) partyReceivedScreen.hidden = nextView !== 'party-received';
      if (nextView === 'party-received') loadReceivedPartyInvites();
      if (nextView !== 'party-leader') $('#partyLeaderDisbandModal').hidden = true;
      if (accountScreen) accountScreen.hidden = nextView !== 'account';
      if (nextView === 'account') {
        if (typeof setStitchAccountSubView === 'function') setStitchAccountSubView('main');
        if (typeof syncStitchAccountUI === 'function') syncStitchAccountUI();
      }
      if (editorHud) editorHud.hidden = nextView !== 'course-editor';
      if (nextView === 'routes') {
        const routesRegion = $('#mobileRoutesRegion');
        if (routesRegion && [...routesRegion.options].some(option => option.value === $('#region').value)) routesRegion.value = $('#region').value;
        renderMobileSavedRoutes();
      }
      if (nextView === 'course-editor') {
        const cur = getActiveCourse();
        const mInput = $('#mobileEditorCourseName');
        if (mInput && cur) mInput.value = cur.name;
        const editorRegion = $('#mobileEditorRegion');
        if (editorRegion && [...editorRegion.options].some(option => option.value === $('#region').value)) editorRegion.value = $('#region').value;
        const mStats = $('#mobileEditorStatsText');
        if (mStats) mStats.textContent = distanceKm(state.points).toFixed(1) + ' km · ' + state.points.length + 'pt';
      }
      if (panelTitle) {
        panelTitle.textContent = nextView === 'routes' ? '코스' : nextView === 'party' ? '파티' : nextView === 'course-editor' ? '코스 작성' : '지도';
      }
      if (sidebar) {
        sidebar.setAttribute('aria-hidden', String(!['routes', 'party', 'course-editor'].includes(nextView)));
        if (nextView === 'routes' || nextView === 'party') sidebar.scrollTop = 0;
      }
      if (nextView === 'account') {
        syncStitchAccountUI();
        if (state.profile?.role === 'admin') {
          loadPendingUsers();
        }
      }
      requestAnimationFrame(() => {
        map.resize();
        if ((nextView === 'map' || nextView === 'ride') && !profilePanel?.classList.contains('collapsed')) drawProfile();
        if (nextView === 'routes' || nextView === 'course-editor') renderMobileCourseProfiles();
      });
    }
    setMobileAppView = showMobileView;

    function syncMobileMode() {
      if (mobileMedia.matches && !mobileMode) {
        mobileMode = true;
        desktopProfileCollapsed = Boolean(profilePanel?.classList.contains('collapsed'));
        profilePanel?.classList.add('collapsed');
        mapPanel?.classList.remove('profile-open');
        $('#profileToggle')?.setAttribute('aria-expanded', 'false');
        showMobileView('home');
      } else if (!mobileMedia.matches && mobileMode) {
        mobileMode = false;
        delete document.body.dataset.mobileTab;
        delete document.body.dataset.mobileView;
        if (partyPanel) partyPanel.hidden = true;
        if (accountScreen) accountScreen.hidden = true;
        sidebar?.removeAttribute('aria-hidden');
        profilePanel?.classList.toggle('collapsed', desktopProfileCollapsed);
        mapPanel?.classList.toggle('profile-open', !desktopProfileCollapsed);
        $('#profileToggle')?.setAttribute('aria-expanded', String(!desktopProfileCollapsed));
        requestAnimationFrame(() => {
          map.resize();
          if (!desktopProfileCollapsed) drawProfile();
        });
      }
    }

    const mobileRegion = $('#mobileRegionSelect');
    if (mobileRegion) {
      mobileRegion.value = $('#region').value;
      mobileRegion.addEventListener('change', () => {
        $('#region').value = mobileRegion.value;
        setRegion();
        renderMobileMapCourses({ reset: true });
      });
      $('#region').addEventListener('change', () => {
        mobileRegion.value = $('#region').value;
        renderMobileMapCourses({ reset: true });
      });
    }

    const mobileMapCourseSelect = $('#mobileMapCourseSelect');
    mobileMapCourseSelect?.addEventListener('focus', () => renderMobileMapCourses());
    mobileMapCourseSelect?.addEventListener('change', () => {
      if (mobileMapCourseSelect.value === '') {
        clearLine();
        return;
      }
      const item = state.saved[Number(mobileMapCourseSelect.value)];
      if (!item || (item.region && item.region !== $('#region').value)) {
        renderMobileMapCourses({ reset: true });
        return;
      }
      applySavedRoute(item, 'map');
    });

    const mobileTiltBtn = $('#mobileTiltBtn');
    const mobileTiltLabel = $('#mobileTiltLabel');
    if (mobileTiltBtn) {
      mobileTiltBtn.addEventListener('click', () => {
        const isPitching = map.getPitch() > 20;
        map.easeTo({ pitch: isPitching ? 0 : 58, duration: 700 });
        if (mobileTiltLabel) {
          mobileTiltLabel.textContent = isPitching ? '2D' : '3D';
        }
        mobileTiltBtn.classList.toggle('active', !isPitching);
        const rideTiltLabel = $('#rideTiltLabel');
        if (rideTiltLabel) rideTiltLabel.textContent = isPitching ? '2D' : '3D';
      });
    }

    const mobileStyleBtn = $('#mobileStyleBtn');
    const mobileStyleIcon = $('#mobileStyleIcon');
    if (mobileStyleBtn) {
      mobileStyleBtn.addEventListener('click', () => {
        const nextStyle = state.mapStyle === 'topo' ? 'satellite' : 'topo';
        setMapStyle(nextStyle);
        if (mobileStyleIcon) {
          mobileStyleIcon.textContent = nextStyle === 'topo' ? 'terrain' : 'satellite_alt';
        }
        const mobileStyleLabel = $('#mobileStyleLabel');
        if (mobileStyleLabel) mobileStyleLabel.textContent = nextStyle === 'topo' ? '지형' : '위성';
        const rideStyleLabel = $('#rideStyleLabel');
        if (rideStyleLabel) rideStyleLabel.textContent = nextStyle === 'topo' ? '지형' : '위성';
      });
    }

    const mobileCompassBtn = $('#mobileCompassBtn');
    const mobileCompassNeedle = $('#mobileCompassNeedle');
    if (mobileCompassBtn) {
      mobileCompassBtn.addEventListener('click', () => {
        map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
      });
      map.on('rotate', () => {
        const rotation = 'rotate(' + (-map.getBearing()) + 'deg)';
        if (mobileCompassNeedle) mobileCompassNeedle.style.transform = rotation;
        const rideCompassNeedle = $('#rideCompassNeedle');
        if (rideCompassNeedle) rideCompassNeedle.style.transform = rotation;
      });
    }

    $('#mobileZoomInBtn')?.addEventListener('click', () => map.zoomIn({ duration: 300 }));
    $('#mobileZoomOutBtn')?.addEventListener('click', () => map.zoomOut({ duration: 300 }));
    $('#mobileLocateBtn')?.addEventListener('click', () => triggerMyLocationGps({ center: true }));
    $('#mobileInfoBtn')?.addEventListener('click', () => $('#profileToggle')?.click());
    $('#mobileMapAnalyticsBtn')?.addEventListener('click', () => $('#profileToggle')?.click());
    $('#mobileMapRideOnBtn')?.addEventListener('click', () => mobileHomeRideOn('ride'));

    $('#mobileCreateCourseBtn')?.addEventListener('click', () => {
      openCourseEditor();
    });

    mobileNavItems.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        if (state.editorMode && item.dataset.tab !== 'routes') requestCloseCourseEditor();
        else showMobileView(item.dataset.tab);
      });
    });

    $('#savedList')?.addEventListener('click', e => {
      if (mobileMedia.matches && e.target.closest('.saved-item')) showMobileView('map');
    });

    if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', syncMobileMode);
    else mobileMedia.addListener(syncMobileMode);
    syncMobileMode();
  }
  initMobileHud();


  // ==========================================================================
  // Stitch Mobile Auth Controller (Screens 6b751362408f4979843ace0eca26502d / 70abe4796b054231b135cf11d270684e)
  // ==========================================================================
  function setMobileAuthView(view) {
    mobileAuthActiveView = view === 'signup' ? 'signup' : 'login';
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const isApproved = state.profile?.status === 'approved';
    if (isMobile && authInitializationComplete && !isApproved) {
      document.body.dataset.mobileAuth = mobileAuthActiveView;
    }
    const checkingView = $('#mobileAuthCheckingView');
    const loginView = $('#mobileLoginView');
    const signupView = $('#mobileSignupView');
    if (checkingView) checkingView.hidden = true;
    if (loginView) loginView.hidden = mobileAuthActiveView !== 'login';
    if (signupView) signupView.hidden = mobileAuthActiveView !== 'signup';
    const tabLogin = $('#mobileTabLogin');
    const tabSignup = $('#mobileTabSignup');
    if (tabLogin && tabSignup) {
      tabLogin.classList.toggle('active', mobileAuthActiveView === 'login');
      tabSignup.classList.toggle('active', mobileAuthActiveView === 'signup');
    }
    // Clear feedbacks when switching view
    const loginFeedback = $('#mobileLoginFeedback');
    const signupFeedback = $('#mobileSignupFeedback');
    if (loginFeedback) { loginFeedback.textContent = ''; loginFeedback.hidden = true; }
    if (signupFeedback) { signupFeedback.textContent = ''; signupFeedback.hidden = true; }
    const successCard = $('#mobileSignupSuccessCard');
    if (successCard && mobileAuthActiveView === 'login') {
      successCard.hidden = true;
    }
  }

  function syncMobileAuthState(customMessage = '') {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const signedIn = Boolean(state.session?.user);
    const profile = state.profile;
    const isApproved = profile?.status === 'approved';
    const container = $('#mobileAuthContainer');
    const checkingView = $('#mobileAuthCheckingView');
    const loginView = $('#mobileLoginView');
    const signupView = $('#mobileSignupView');

    if (!isMobile) {
      delete document.body.dataset.mobileAuth;
      if (container) container.hidden = true;
      return;
    }

    if (!authInitializationComplete) {
      document.body.dataset.mobileAuth = 'checking';
      if (container) container.hidden = false;
      if (checkingView) checkingView.hidden = false;
      if (loginView) loginView.hidden = true;
      if (signupView) signupView.hidden = true;
      return;
    }

    // Mobile auth gating: if user is not signed in or not approved, show Stitch Auth
    if (!signedIn || !isApproved) {
      document.body.dataset.mobileAuth = mobileAuthActiveView;
      if (container) container.hidden = false;
      if (checkingView) checkingView.hidden = true;
      if (loginView) loginView.hidden = mobileAuthActiveView !== 'login';
      if (signupView) signupView.hidden = mobileAuthActiveView !== 'signup';
      const loginFeedback = $('#mobileLoginFeedback');
      if (loginFeedback) {
        if (signedIn && profile?.status === 'pending') {
          loginFeedback.textContent = t('toastPendingNotice');
          loginFeedback.className = 'mobile-auth-feedback feedback-warning';
          loginFeedback.hidden = false;
        } else if (signedIn && profile?.status === 'rejected') {
          loginFeedback.textContent = t('toastRejectedNotice');
          loginFeedback.className = 'mobile-auth-feedback';
          loginFeedback.hidden = false;
        } else if (customMessage) {
          loginFeedback.textContent = customMessage;
          loginFeedback.className = 'mobile-auth-feedback';
          loginFeedback.hidden = false;
        }
      }
    } else {
      // Approved user: remove mobile auth screen, reveal Stitch Home (first screen after login)
      const wasGated = 'mobileAuth' in document.body.dataset;
      delete document.body.dataset.mobileAuth;
      if (container) container.hidden = true;
      if (wasGated && typeof setMobileAppView === 'function') setMobileAppView('home');
      const loginFeedback = $('#mobileLoginFeedback');
      if (loginFeedback) { loginFeedback.textContent = ''; loginFeedback.hidden = true; }
      requestAnimationFrame(() => {
        if (typeof map?.resize === 'function') map.resize();
      });
    }
  }

  function initMobileAuthInteractions() {
    const rememberedEmailKey = 'powderline.mobileLoginEmail';
    const rememberEmail = $('#mobileRememberEmail');
    const loginEmail = $('#mobileLoginEmail');
    if (rememberEmail && loginEmail) {
      const savedEmail = localStorage.getItem(rememberedEmailKey);
      if (savedEmail) {
        loginEmail.value = savedEmail;
        rememberEmail.checked = true;
      }
      rememberEmail.addEventListener('change', () => {
        if (!rememberEmail.checked) localStorage.removeItem(rememberedEmailKey);
      });
    }

    // 1. Tab switches
    $('#mobileTabLogin')?.addEventListener('click', () => setMobileAuthView('login'));
    $('#mobileTabSignup')?.addEventListener('click', () => setMobileAuthView('signup'));
    $('#mobileQuickSignupBtn')?.addEventListener('click', () => setMobileAuthView('signup'));
    $('#mobileSignupBackBtn')?.addEventListener('click', () => setMobileAuthView('login'));
    $('#mobileReturnLoginBtn')?.addEventListener('click', () => setMobileAuthView('login'));
    $('#mobileGoToLoginBtn')?.addEventListener('click', () => setMobileAuthView('login'));

    // 2. Password visibility toggles
    function setupPwToggle(btnId, inputId, iconId) {
      const btn = $(btnId);
      const input = $(inputId);
      const icon = $(iconId);
      if (!btn || !input || !icon) return;
      btn.addEventListener('click', () => {
        const isPw = input.type === 'password';
        input.type = isPw ? 'text' : 'password';
        icon.textContent = isPw ? 'visibility_off' : 'visibility';
      });
    }
    setupPwToggle('#mobileToggleLoginPw', '#mobileLoginPassword', '#mobileLoginPwEye');
    setupPwToggle('#mobileToggleSignupPw', '#mobileSignupPassword', '#mobileSignupPwEye');
    setupPwToggle('#mobileToggleSignupConfirm', '#mobileSignupPasswordConfirm', '#mobileSignupConfirmEye');

    // 3. Mobile Login Form Submission (Reuses Supabase client & approval check)
    $('#mobileLoginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!supabaseClient) return toast(t('authNeedKey'));
      const email = $('#mobileLoginEmail')?.value.trim();
      const password = $('#mobileLoginPassword')?.value;
      const rememberEmailChecked = Boolean($('#mobileRememberEmail')?.checked);
      const feedback = $('#mobileLoginFeedback');
      const submitBtn = $('#mobileLoginSubmitBtn');
      const submitText = $('#mobileLoginSubmitText');

      if (!email || !password) return;
      if (feedback) { feedback.textContent = ''; feedback.hidden = true; }
      if (submitBtn) { submitBtn.dataset.busy = 'true'; submitBtn.disabled = true; }
      if (submitText) submitText.textContent = '로그인 중...';

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          if (feedback) {
            feedback.textContent = error.message;
            feedback.className = 'mobile-auth-feedback';
            feedback.hidden = false;
          }
          toast(error.message);
          return;
        }

        if (rememberEmailChecked) localStorage.setItem(rememberedEmailKey, email);

        state.session = data?.session || null;
        // Load user profile to check approval status
        await loadUserProfile();

        if (state.profile?.status !== 'approved') {
          const isPending = state.profile?.status === 'pending';
          const msg = isPending ? t('toastPendingNotice') : t('toastRejectedNotice');
          if (feedback) {
            feedback.textContent = msg;
            feedback.className = isPending ? 'mobile-auth-feedback feedback-warning' : 'mobile-auth-feedback';
            feedback.hidden = false;
          }
          toast(msg);
          return;
        }

        // Approved!
        $('#mobileLoginPassword').value = '';
        if ($('#authPassword')) $('#authPassword').value = '';
        syncMobileAuthState();
        toast(t('toastLoginSuccess'));
      } catch (err) {
        console.error('Mobile login error:', err);
        if (feedback) {
          feedback.textContent = err.message || '로그인 중 오류가 발생했습니다.';
          feedback.className = 'mobile-auth-feedback';
          feedback.hidden = false;
        }
      } finally {
        if (submitBtn) { submitBtn.dataset.busy = 'false'; submitBtn.disabled = !supabaseClient || !authInitializationComplete; }
        if (submitText) submitText.textContent = '로그인';
      }
    });

    // 4. Mobile Signup Form Submission (Reuses Supabase client & admin approval flow)
    $('#mobileSignupForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!supabaseClient) {
        toast(t('authNeedKey'));
        return;
      }
      const email = $('#mobileSignupEmail')?.value.trim();
      const password = $('#mobileSignupPassword')?.value;
      const passwordConfirm = $('#mobileSignupPasswordConfirm')?.value;
      const nickname = $('#mobileSignupNickname')?.value.trim();
      const feedback = $('#mobileSignupFeedback');
      const submitBtn = $('#mobileSignupSubmitBtn');
      const submitText = $('#mobileSignupSubmitText');
      const successCard = $('#mobileSignupSuccessCard');

      if (feedback) { feedback.textContent = ''; feedback.hidden = true; }
      if (successCard) successCard.hidden = true;

      // Validations
      if (!nickname) {
        if (feedback) { feedback.textContent = t('signupNicknameRequired'); feedback.hidden = false; }
        $('#mobileSignupNickname')?.focus();
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (feedback) { feedback.textContent = t('signupEmailInvalid'); feedback.hidden = false; }
        $('#mobileSignupEmail')?.focus();
        return;
      }
      if (!password || password.length < 6) {
        if (feedback) { feedback.textContent = t('signupPasswordTooShort'); feedback.hidden = false; }
        $('#mobileSignupPassword')?.focus();
        return;
      }
      if (password !== passwordConfirm) {
        if (feedback) { feedback.textContent = t('toastPasswordMismatch'); feedback.hidden = false; }
        $('#mobileSignupPasswordConfirm')?.focus();
        return;
      }

      if (submitBtn) { submitBtn.dataset.busy = 'true'; submitBtn.disabled = true; }
      if (submitText) submitText.textContent = t('btnSubmittingSignup');

      try {
        const { data, error } = await waitForSignupResponse(supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { nickname } }
        }));

        if (error) {
          if (feedback) {
            feedback.textContent = error.message || t('toastSignupFailed');
            feedback.hidden = false;
          }
          return;
        }

        if (!data?.user) throw new Error(t('toastSignupFailed'));

        // If session automatically created by Supabase, sign out so account stays on pending login state
        if (data?.session) {
          await supabaseClient.auth.signOut();
          state.session = null;
          state.profile = null;
        }

        // Show Stitch Signup Success Confirmation Card
        if (successCard) {
          successCard.hidden = false;
          successCard.scrollIntoView({ behavior: 'smooth' });
        }

        // Pre-fill email in mobile & desktop login forms
        if ($('#mobileLoginEmail')) $('#mobileLoginEmail').value = email;
        if ($('#authEmail')) $('#authEmail').value = email;
        $('#mobileSignupPassword').value = '';
        $('#mobileSignupPasswordConfirm').value = '';

        toast(t('toastSignupPending'));
      } catch (err) {
        console.error('Mobile signup error:', err);
        if (feedback) {
          feedback.textContent = err.message || t('toastSignupFailed');
          feedback.hidden = false;
        }
      } finally {
        if (submitBtn) { submitBtn.dataset.busy = 'false'; submitBtn.disabled = !supabaseClient || !authInitializationComplete; }
        if (submitText) submitText.textContent = t('btnSubmitSignup');
      }
    });

    // Watch media query changes to sync mobile auth state
    window.matchMedia('(max-width: 768px)').addEventListener('change', () => {
      syncMobileAuthState();
    });
  }

  initMobileAuthInteractions();

  // ==========================================================================
  // Stitch Mobile Account View Synchronization (Screen: 3cd69f9c7a5d45d09a081ff6b42206d8)
  // ==========================================================================
  // ==========================================================================
  // STITCH MOBILE ACCOUNT INTERACTIONS & CONTROLLER (4 Screens Integrated)
  // ==========================================================================

  let adminUsersCache = [];
  let currentAdminTab = 'pending';

  function setStitchAccountSubView(subview) {
    const mainView = $('#mobileAccountMainView');
    const adminUsersView = $('#mobileAdminUsersView');
    const deleteView = $('#mobileDeleteAccountView');

    if (mainView) mainView.hidden = subview !== 'main';
    if (adminUsersView) adminUsersView.hidden = subview !== 'adminUsers';
    if (deleteView) deleteView.hidden = subview !== 'deleteAccount';

    if (subview === 'adminUsers') {
      loadAdminUsersList();
    } else if (subview === 'deleteAccount') {
      resetDeleteAccountView();
    }
  }

  function syncStitchAccountUI() {
    const profile = state.profile;
    const user = state.session?.user;
    const isAdmin = profile?.role === 'admin';
    const isApproved = profile?.status === 'approved';

    const nickEl = $('#stitchAccountNickname');
    const emailEl = $('#stitchAccountEmail');
    const approvedBadge = $('#stitchAccountApprovedBadge');
    const adminBadge = $('#stitchAccountAdminBadge');
    const adminConsole = $('#stitchAdminConsoleSection');
    const pendingCountBadge = $('#stitchAdminPendingCountBadge');

    const nickname = profile?.nickname || user?.user_metadata?.nickname || '라이더';
    const email = user?.email || 'rider@powderline.app';

    if (nickEl) nickEl.textContent = nickname;
    if (emailEl) emailEl.textContent = email;

    if (approvedBadge) {
      if (isApproved) {
        approvedBadge.hidden = false;
        approvedBadge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container/20 text-secondary';
        approvedBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span><span class="font-label-sm text-label-sm font-semibold">승인 완료</span>';
      } else if (profile?.status === 'pending') {
        approvedBadge.hidden = false;
        approvedBadge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary';
        approvedBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-tertiary"></span><span class="font-label-sm text-label-sm font-semibold">승인 대기</span>';
      } else {
        approvedBadge.hidden = true;
      }
    }

    if (adminBadge) {
      adminBadge.hidden = !isAdmin;
    }

    if (adminConsole) {
      adminConsole.hidden = !isAdmin;
    }

    if (pendingCountBadge) {
      const count = state.pendingUsers ? state.pendingUsers.length : 0;
      pendingCountBadge.textContent = `대기 ${count}명`;
    }

    // Party Section Active / Empty Toggle
    const activePartyCard = $('#stitchPartyActiveCard');
    const emptyPartyCard = $('#stitchPartyEmptyCard');
    const partyNameEl = $('#stitchPartyActiveName');
    const partyRoleText = $('#stitchPartyRoleText');

    const hasParty = Boolean(state.currentParty);
    if (activePartyCard && emptyPartyCard) {
      activePartyCard.hidden = !hasParty;
      emptyPartyCard.hidden = hasParty;
      if (hasParty) {
        if (partyNameEl) partyNameEl.textContent = state.currentParty.name || 'KIRORO BACKCOUNTRY';
        if (partyRoleText) partyRoleText.textContent = state.currentParty.isLeader ? '파티장 (Master)' : '대원 (Member)';
      }
    }
  }

  async function loadAdminUsersList() {
    if (!supabaseClient || state.profile?.role !== 'admin') return;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, email, nickname, status, role, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('loadAdminUsersList error:', error);
        return;
      }
      adminUsersCache = data || [];
      renderAdminUsersList();
    } catch (err) {
      console.error('loadAdminUsersList error:', err);
    }
  }

  function renderAdminUsersList() {
    const pendingList = $('#stitchAdminContentPending');
    const approvedList = $('#stitchAdminContentApproved');
    const revokedList = $('#stitchAdminContentRevoked');
    const searchInput = $('#stitchMemberSearchInput');
    const query = (searchInput?.value || '').trim().toLowerCase();

    const filtered = adminUsersCache.filter(u => {
      if (!query) return true;
      const nick = (u.nickname || '').toLowerCase();
      const mail = (u.email || '').toLowerCase();
      return nick.includes(query) || mail.includes(query);
    });

    const pendingUsers = filtered.filter(u => u.status === 'pending');
    const approvedUsers = filtered.filter(u => u.status === 'approved');
    const revokedUsers = filtered.filter(u => u.status === 'rejected' || u.status === 'revoked');

    // Update Tab Counts
    const tabPending = $('#stitchTabPending');
    const tabApproved = $('#stitchTabApproved');
    const tabRevoked = $('#stitchTabRevoked');
    if (tabPending) {
      const countSpan = tabPending.querySelector('.font-label-sm');
      if (countSpan) countSpan.textContent = `${pendingUsers.length} 건`;
    }
    if (tabApproved) {
      const countSpan = tabApproved.querySelector('.font-label-sm');
      if (countSpan) countSpan.textContent = `${approvedUsers.length} 명`;
    }
    if (tabRevoked) {
      const countSpan = tabRevoked.querySelector('.font-label-sm');
      if (countSpan) countSpan.textContent = `${revokedUsers.length} 명`;
    }

    // Render Pending List
    if (pendingList) {
      let html = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary-container text-[18px]">pending_actions</span>
          <h3 class="font-headline-md text-headline-md text-on-surface font-semibold">신청 대기</h3>
        </div>
        <span class="font-label-sm text-label-sm text-primary-container">${pendingUsers.length}명 대기</span>
      </div>
    `;
      if (!pendingUsers.length) {
        html += `<div class="text-center py-8 text-outline font-body-sm bg-surface-container rounded-xl">대기 중인 회원이 없습니다.</div>`;
      } else {
        pendingUsers.forEach(u => {
          const nick = escapeHtml(u.nickname || '익명 라이더');
          const email = escapeHtml(u.email || '-');
          const date = u.created_at ? new Date(u.created_at).toLocaleDateString() : '';
          html += `
          <div class="flex flex-col rounded-xl bg-surface-container p-space-md shadow-md transition-all hover:bg-surface-container-high/90">
            <div class="flex items-start justify-between mb-space-sm">
              <div class="flex items-center gap-space-sm">
                <div class="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-bold text-primary-container">
                  ${nick.charAt(0).toUpperCase()}
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="font-headline-md text-body-lg font-bold text-on-surface truncate">${nick}</span>
                  <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${email}</span>
                </div>
              </div>
              <span class="font-label-sm text-label-sm text-outline">${date}</span>
            </div>
            <div class="grid grid-cols-2 gap-space-sm mt-space-xs">
              <button class="flex items-center justify-center gap-1 h-11 rounded-lg bg-primary-container text-on-primary-container font-body-md font-semibold active:scale-95 transition-transform" data-user-action="approve" data-user-id="${u.id}">
                <span class="material-symbols-outlined text-[18px]">check</span>
                <span>승인 처리</span>
              </button>
              <button class="flex items-center justify-center gap-1 h-11 rounded-lg bg-surface-container-high text-error hover:bg-error-container/20 font-body-md font-semibold active:scale-95 transition-transform" data-user-action="reject" data-user-id="${u.id}">
                <span class="material-symbols-outlined text-[18px]">close</span>
                <span>거절</span>
              </button>
            </div>
          </div>
        `;
        });
      }
      pendingList.innerHTML = html;
    }

    // Render Approved List
    if (approvedList) {
      let html = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary text-[18px]">how_to_reg</span>
          <h3 class="font-headline-md text-headline-md text-on-surface font-semibold">가입 목록</h3>
        </div>
        <span class="font-label-sm text-label-sm text-secondary">활성 세션</span>
      </div>
    `;
      if (!approvedUsers.length) {
        html += `<div class="text-center py-8 text-outline font-body-sm bg-surface-container rounded-xl">승인된 회원이 없습니다.</div>`;
      } else {
        approvedUsers.forEach(u => {
          const nick = escapeHtml(u.nickname || '익명 라이더');
          const email = escapeHtml(u.email || '-');
          const isAdmin = u.role === 'admin';
          html += `
          <div class="flex flex-col rounded-xl bg-surface-container p-space-md shadow-md mb-space-sm">
            <div class="flex items-start justify-between mb-space-sm">
              <div class="flex items-center gap-space-sm">
                <div class="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center font-bold">
                  ${nick.charAt(0).toUpperCase()}
                </div>
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-headline-md text-body-lg font-bold text-on-surface truncate">${nick}</span>
                    ${isAdmin ? '<span class="text-[12px]">👑</span>' : ''}
                  </div>
                  <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${email}</span>
                </div>
              </div>
            </div>
            ${!isAdmin ? `
            <div class="grid grid-cols-2 gap-space-sm">
              <button class="flex items-center justify-center gap-1 h-10 rounded-lg bg-surface-container-high text-on-surface font-body-sm font-medium hover:bg-surface-container-highest transition-colors active:scale-98" data-user-action="reject" data-user-id="${u.id}">
                <span class="material-symbols-outlined text-[16px]">undo</span>
                <span>승인 취소</span>
              </button>
              <button class="flex items-center justify-center gap-1 h-10 rounded-lg bg-error-container text-on-error-container font-body-sm font-medium hover:bg-error-container/80 transition-colors active:scale-98" data-user-action="reject" data-user-id="${u.id}">
                <span class="material-symbols-outlined text-[16px]">person_remove</span>
                <span>강제 탈퇴</span>
              </button>
            </div>` : ''}
          </div>
        `;
        });
      }
      approvedList.innerHTML = html;
    }

    // Render Revoked List
    if (revokedList) {
      const listEl = $('#stitchAdminRevokedList');
      if (listEl) {
        if (!revokedUsers.length) {
          listEl.innerHTML = '<div class="text-center py-6 text-outline font-body-sm">거절되거나 탈퇴한 회원이 없습니다.</div>';
        } else {
          listEl.innerHTML = revokedUsers.map(u => {
            const nick = escapeHtml(u.nickname || '익명');
            const email = escapeHtml(u.email || '-');
            return `
            <div class="flex items-center justify-between p-space-md rounded-xl bg-surface-container shadow-md">
              <div class="flex flex-col min-w-0">
                <span class="font-body-md font-bold text-on-surface truncate">${nick}</span>
                <span class="font-label-sm text-outline truncate">${email}</span>
              </div>
              <button class="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-body-sm font-semibold active:scale-95 transition-transform" data-user-action="approve" data-user-id="${u.id}">
                재승인
              </button>
            </div>
          `;
          }).join('');
        }
      }
    }
  }

  function switchAdminTab(type) {
    currentAdminTab = type;
    const tabs = ['pending', 'approved', 'revoked'];
    tabs.forEach(t => {
      const btn = $('#stitchTab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) {
        if (t === type) {
          btn.className = "flex flex-col items-center justify-center py-2.5 px-1 rounded transition-all duration-200 bg-surface-container-high shadow-md";
          const firstSpan = btn.querySelector('.font-label-md');
          if (firstSpan) {
            firstSpan.className = "font-label-md text-label-md font-bold text-primary-container";
          }
        } else {
          btn.className = "flex flex-col items-center justify-center py-2.5 px-1 rounded transition-all duration-200 hover:bg-surface-container-high/40";
          const firstSpan = btn.querySelector('.font-label-md');
          if (firstSpan) {
            firstSpan.className = "font-label-md text-label-md text-on-surface-variant";
          }
        }
      }
    });

    const pendingSec = $('#stitchAdminContentPending');
    const approvedSec = $('#stitchAdminContentApproved');
    const revokedSec = $('#stitchAdminContentRevoked');

    if (pendingSec) pendingSec.hidden = type !== 'pending';
    if (approvedSec) approvedSec.hidden = type !== 'approved';
    if (revokedSec) revokedSec.hidden = type !== 'revoked';
  }

  function resetDeleteAccountView() {
    const agreeCheckbox = $('#stitchDeleteAgreeCheckbox');
    const confirmDeleteBtn = $('#stitchConfirmDeleteBtn');
    const inputHint = $('#stitchDeleteInputHint');

    if (agreeCheckbox) agreeCheckbox.checked = false;
    if (confirmDeleteBtn) {
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.className = 'w-full min-h-[52px] rounded-lg bg-error-container/40 text-on-error-container/40 font-body-lg text-body-lg font-bold flex items-center justify-center gap-space-xs cursor-not-allowed transition-all duration-300 shadow-none';
      const iconSpan = confirmDeleteBtn.querySelector('.material-symbols-outlined');
      if (iconSpan) iconSpan.textContent = 'lock';
    }
    if (inputHint) {
      inputHint.textContent = '체크박스에 동의해야 회원 탈퇴 버튼이 활성화됩니다.';
      inputHint.className = 'font-label-sm text-label-sm text-outline px-1';
    }
  }

  function initStitchAccountInteractions() {
    // Navigation & Subviews
    $('#stitchAccountBackBtn')?.addEventListener('click', () => {
      showMobileView('map');
    });

    $('#stitchOpenAdminUsersBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('adminUsers');
    });

    $('#stitchAdminUsersBackBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('main');
    });

    $('#stitchOpenDeleteAccountBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('deleteAccount');
    });

    $('#stitchDeleteAccountBackBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('main');
    });

    $('#stitchCancelDeleteBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('main');
    });

    // Edit Nickname
    $('#stitchBtnEditNickname')?.addEventListener('click', async () => {
      if (!supabaseClient) return;
      const current = state.profile?.nickname || '';
      const newNick = prompt('새로운 닉네임을 입력해주세요:', current);
      if (!newNick || !newNick.trim() || newNick.trim() === current) return;

      try {
        const { error } = await supabaseClient
          .from('profiles')
          .update({ nickname: newNick.trim() })
          .eq('id', state.session.user.id);

        if (error) throw error;
        if (state.profile) state.profile.nickname = newNick.trim();
        syncStitchAccountUI();
        toast('닉네임이 성공적으로 변경되었습니다.');
      } catch (err) {
        console.error('Update nickname error:', err);
        toast(err.message || '닉네임 변경에 실패했습니다.');
      }
    });

    // Toggle Keep Login
    const keepLoginToggle = $('#stitchToggleKeepLogin');
    const keepLoginThumb = $('#stitchToggleThumb');
    let isKeepLogin = true;
    if (keepLoginToggle && keepLoginThumb) {
      keepLoginToggle.addEventListener('click', () => {
        isKeepLogin = !isKeepLogin;
        keepLoginToggle.setAttribute('aria-checked', isKeepLogin.toString());
        if (isKeepLogin) {
          keepLoginToggle.classList.remove('bg-surface-container-highest');
          keepLoginToggle.classList.add('bg-secondary-container');
          keepLoginThumb.classList.remove('translate-x-0');
          keepLoginThumb.classList.add('translate-x-6');
          keepLoginThumb.innerHTML = '<span class="material-symbols-outlined text-[14px] text-secondary">check</span>';
        } else {
          keepLoginToggle.classList.remove('bg-secondary-container');
          keepLoginToggle.classList.add('bg-surface-container-highest');
          keepLoginThumb.classList.remove('translate-x-6');
          keepLoginThumb.classList.add('translate-x-0');
          keepLoginThumb.innerHTML = '<span class="material-symbols-outlined text-[14px] text-outline">close</span>';
        }
      });
    }

    // Party Actions
    $('#stitchGoToPartyScreenBtn')?.addEventListener('click', () => {
      showMobileView('party');
    });

    $('#stitchFindPartyBtn')?.addEventListener('click', () => {
      showMobileView('party');
    });

    $('#stitchBtnLeaveParty')?.addEventListener('click', () => {
      if (confirm("'KIRORO BACKCOUNTRY' 파티를 탈퇴하시겠습니까?")) {
        state.currentParty = null;
        try { localStorage.removeItem('powderline_active_party'); } catch (e) { }
        syncStitchAccountUI();
        toast('파티에서 탈퇴했습니다.');
      }
    });

    // Admin User Tabs
    $('#stitchTabPending')?.addEventListener('click', () => switchAdminTab('pending'));
    $('#stitchTabApproved')?.addEventListener('click', () => switchAdminTab('approved'));
    $('#stitchTabRevoked')?.addEventListener('click', () => switchAdminTab('revoked'));

    // Admin Search Input
    $('#stitchMemberSearchInput')?.addEventListener('input', () => {
      renderAdminUsersList();
    });

    // Admin User Action Delegation
    $('#mobileAdminUsersView')?.addEventListener('click', async e => {
      const btn = e.target.closest('button[data-user-action]');
      if (!btn) return;
      const action = btn.dataset.userAction;
      const userId = btn.dataset.userId;
      if (!userId || !action) return;

      btn.disabled = true;
      try {
        await handleSetUserStatus(userId, action === 'approve' ? 'approved' : 'rejected');
        await loadAdminUsersList();
        toast(action === 'approve' ? '회원이 승인되었습니다.' : '회원이 거절/취소 처리되었습니다.');
      } catch (err) {
        console.error('Admin action error:', err);
        toast('처리에 실패했습니다.');
      } finally {
        btn.disabled = false;
      }
    });

    // Delete Account Checkbox & Confirm
    const agreeCheckbox = $('#stitchDeleteAgreeCheckbox');
    const confirmDeleteBtn = $('#stitchConfirmDeleteBtn');
    const inputHint = $('#stitchDeleteInputHint');

    if (agreeCheckbox && confirmDeleteBtn) {
      agreeCheckbox.addEventListener('change', () => {
        const isChecked = agreeCheckbox.checked;
        confirmDeleteBtn.disabled = !isChecked;
        if (isChecked) {
          confirmDeleteBtn.className = 'w-full min-h-[52px] rounded-lg bg-error text-on-error font-body-lg text-body-lg font-bold flex items-center justify-center gap-space-xs cursor-pointer shadow-[0_0_24px_rgba(244,63,94,0.45)] active:scale-[0.98] transition-all border-0';
          const iconSpan = confirmDeleteBtn.querySelector('.material-symbols-outlined');
          if (iconSpan) iconSpan.textContent = 'warning';
          if (inputHint) {
            inputHint.textContent = '확인 완료: 회원 탈퇴 버튼을 누르면 즉시 모든 데이터가 삭제됩니다.';
            inputHint.className = 'font-label-sm text-label-sm text-secondary px-1';
          }
        } else {
          confirmDeleteBtn.className = 'w-full min-h-[52px] rounded-lg bg-error-container/40 text-on-error-container/40 font-body-lg text-body-lg font-bold flex items-center justify-center gap-space-xs cursor-not-allowed transition-all duration-300 shadow-none border-0';
          const iconSpan = confirmDeleteBtn.querySelector('.material-symbols-outlined');
          if (iconSpan) iconSpan.textContent = 'lock';
          if (inputHint) {
            inputHint.textContent = '체크박스에 동의해야 회원 탈퇴 버튼이 활성화됩니다.';
            inputHint.className = 'font-label-sm text-label-sm text-outline px-1';
          }
        }
      });

      confirmDeleteBtn.addEventListener('click', async () => {
        if (confirmDeleteBtn.disabled) return;
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[20px]">sync</span> 처리 중...';

        try {
          if (supabaseClient) {
            await supabaseClient.auth.signOut();
          }
          alert('POWDERLINE 회원 탈퇴가 완료되었습니다.');
          location.reload();
        } catch (err) {
          console.error('Delete account error:', err);
          alert('탈퇴 처리 중 오류가 발생했습니다.');
          resetDeleteAccountView();
        }
      });
    }

    // Logout action
    $('#stitchLogoutBtn')?.addEventListener('click', async () => {
      if (!supabaseClient) return;
      if (!confirm('POWDERLINE 세션을 안전하게 종료하고 로그아웃하시겠습니까?')) return;
      try {
        await supabaseClient.auth.signOut();
        state.session = null;
        state.profile = null;
        updateAuthUi();
        toast(t('toastLogoutSuccess'));
        location.reload();
      } catch (err) {
        console.error('Logout error:', err);
        toast(err.message || '로그아웃 실패');
      }
    });
  }

  function renderMobileHome() {
    const regionSel = $('#homeRegionSelect');
    const courseSel = $('#homeCourseSelect');
    if (!regionSel || !courseSel) return;
    const srcRegion = $('#region');
    if (!regionSel.options.length && srcRegion) {
      regionSel.innerHTML = [...srcRegion.options].map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.textContent)}</option>`).join('');
      regionSel.value = srcRegion.value;
    }
    const region = regionSel.value;
    const prevCourse = courseSel.value;
    const courses = state.saved.map((r, i) => ({ r, i })).filter(({ r }) => !r.region || r.region === region);
    courseSel.innerHTML = '<option value="">코스 선택 안 함 (지역 지도만 보기)</option>' +
      courses.map(({ r, i }) => `<option value="${i}">${escapeHtml(r.name)} · ${Number(r.km || 0).toFixed(1)} km</option>`).join('');
    if (prevCourse && courses.some(({ i }) => String(i) === prevCourse)) courseSel.value = prevCourse;
    updateMobileHomeMeta();
  }

  function updateMobileHomeMeta() {
    const meta = $('#homeCourseMeta');
    const courseSel = $('#homeCourseSelect');
    if (!meta || !courseSel) return;
    const item = courseSel.value !== '' ? state.saved[+courseSel.value] : null;
    meta.textContent = item ? `DIST: ${Number(item.km || 0).toFixed(1)} km` : `COURSES: ${Math.max(0, courseSel.options.length - 1)}`;
  }

  function applySavedRoute(item, destinationView = 'map') {
    if (!item) return;
    pushHistory();
    state.points = item.points.map(p => ({ ...p }));
    state.selectedVertex = null;
    const cur = getActiveCourse();
    if (cur) {
      cur.name = item.name;
      cur.points = [...state.points];
      cur.databaseId = item.source === 'cloud' ? item.id : null;
      $('#courseName').value = cur.name;
      const mInput = $('#mobileEditorCourseName');
      if (mInput) mInput.value = cur.name;
    }
    const rideName = $('#rideCourseName');
    if (rideName) rideName.textContent = item.name;
    const mobileCourseNameEl = $('#mobileCourseNameDisplay');
    if (mobileCourseNameEl) mobileCourseNameEl.textContent = item.name;
    renderCourseWorkList();
    render();
    if (state.points.length) {
      const bounds = state.points.reduce((box, p) => box.extend([p.lng, p.lat]), new mapboxgl.LngLatBounds([state.points[0].lng, state.points[0].lat], [state.points[0].lng, state.points[0].lat]));
      map.fitBounds(bounds, { padding: 90, duration: 900, maxZoom: 13 });
    }
    toast(t('toastLoadedSaved'));
    if (typeof setMobileAppView === 'function') {
      setMobileAppView(destinationView);
    }
  }

  function mobileHomeRideOn(destinationView = 'ride') {
    const regionSel = $('#homeRegionSelect');
    const courseSel = $('#homeCourseSelect');
    const srcRegion = $('#region');
    if (regionSel && srcRegion && regionSel.value && regionSel.value !== srcRegion.value) {
      srcRegion.value = regionSel.value;
      srcRegion.dispatchEvent(new Event('change'));
    }
    const idx = courseSel?.value;
    if (idx !== undefined && idx !== '') {
      const selectedItem = state.saved[+idx];
      if (selectedItem) {
        applySavedRoute(selectedItem, destinationView);
        return;
      }
    }
    const active = getActiveCourse();
    const rideName = $('#rideCourseName');
    if (rideName) rideName.textContent = active?.name || '코스를 선택하세요';
    const mobileCourseNameEl = $('#mobileCourseNameDisplay');
    if (mobileCourseNameEl) mobileCourseNameEl.textContent = active?.name || t('brandSubtitle');
    setMobileAppView(destinationView);
  }

  function initMobileHomeInteractions() {
    $('#homeRegionSelect')?.addEventListener('change', () => {
      const courseSel = $('#homeCourseSelect');
      if (courseSel) courseSel.value = '';
      renderMobileHome();
    });
    $('#homeCourseSelect')?.addEventListener('change', updateMobileHomeMeta);
    $('#homeRideOnBtn')?.addEventListener('click', () => mobileHomeRideOn('ride'));
    $('#homeOpenMapBtn')?.addEventListener('click', () => mobileHomeRideOn('map'));
    const rideRegion = $('#rideRegionSelect');
    const regularRegion = $('#region');
    if (rideRegion && regularRegion) {
      rideRegion.innerHTML = regularRegion.innerHTML;
      rideRegion.value = regularRegion.value;
      rideRegion.addEventListener('change', () => {
        regularRegion.value = rideRegion.value;
        regularRegion.dispatchEvent(new Event('change'));
      });
    }
    $('#rideExitBtn')?.addEventListener('click', () => setMobileAppView('map'));
    $('#mobileNavMap')?.addEventListener('click', () => setMobileAppView('map'));
    $('#rideTiltBtn')?.addEventListener('click', () => $('#mobileTiltBtn')?.click());
    $('#rideStyleBtn')?.addEventListener('click', () => $('#mobileStyleBtn')?.click());
    $('#rideZoomInBtn')?.addEventListener('click', () => $('#mobileZoomInBtn')?.click());
    $('#rideZoomOutBtn')?.addEventListener('click', () => $('#mobileZoomOutBtn')?.click());
    $('#rideCompassBtn')?.addEventListener('click', () => $('#mobileCompassBtn')?.click());
    $('#rideLocateBtn')?.addEventListener('click', () => triggerMyLocationGps({ center: true }));
    $('#rideInfoBtn')?.addEventListener('click', () => $('#profileToggle')?.click());
    $('#rideAnalyticsBtn')?.addEventListener('click', () => $('#profileToggle')?.click());
    $('#region')?.addEventListener('change', () => {
      const regionSel = $('#homeRegionSelect');
      if (regionSel && regionSel.value !== $('#region').value) { regionSel.value = $('#region').value; renderMobileHome(); }
    });
    renderMobileHome();
  }

  // ==========================================================================
  // Mobile Standalone Screens Controller (Map, Routes, Editor, Party, Account)
  // ==========================================================================
  function renderMobileCourseRegions() {
    const source = $('#region');
    for (const custom of mobileCustomCourseRegions) {
      if (!regions[custom.id]) regions[custom.id] = { label: custom.label, center: custom.center, zoom: 12, bearing: 0, pitch: 45, custom: true };
    }
    const options = [...source.options].filter(option => !option.dataset.courseCustom).map(option => ({ value: option.value, label: option.textContent }));
    for (const custom of mobileCustomCourseRegions) options.push({ value: custom.id, label: custom.label });
    for (const select of [$('#mobileRoutesRegion'), $('#mobileEditorRegion')]) {
      if (!select) continue;
      const previous = select.value || source.value;
      select.innerHTML = options.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
      select.value = options.some(option => option.value === previous) ? previous : source.value;
    }
  }

  function setMobileCourseRegion(region) {
    const details = regions[region];
    if (!details) return;
    const source = $('#region');
    if (![...source.options].some(option => option.value === region)) {
      const option = new Option(details.label, region);
      option.dataset.courseCustom = 'true';
      source.add(option);
    }
    source.value = region;
    $('#mobileRoutesRegion').value = region;
    $('#mobileEditorRegion').value = region;
    if (details.custom) {
      map.flyTo({ center: details.center, zoom: details.zoom, bearing: details.bearing, pitch: details.pitch, duration: 900 });
      map.getSource('ski-facilities')?.setData(emptyCollection);
      clearLine();
    } else {
      source.dispatchEvent(new Event('change'));
    }
    mobileSelectedSavedIndex = '';
    renderMobileSavedRoutes();
  }

  function renderMobileCourseProfiles() {
    const samples = profile.samples;
    const hasProfile = samples.length > 1;
    const message = $('#profileMessage')?.textContent || '경로를 그리면 그래프가 표시됩니다.';
    for (const [canvasId, messageId] of [['#mobileRoutesProfileChart', '#mobileRoutesProfileMessage'], ['#mobileEditorProfileChart', '#mobileEditorProfileMessage']]) {
      const canvas = $(canvasId), label = $(messageId);
      if (!canvas) continue;
      if (label) { label.hidden = hasProfile; label.textContent = message; }
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      if (!hasProfile) continue;
      let min = Infinity, max = -Infinity;
      for (const sample of samples) { min = Math.min(min, sample.elevation); max = Math.max(max, sample.elevation); }
      const elevationRange = Math.max(max - min, 10), distance = samples.at(-1).distance || 1;
      const x = sample => 5 + sample.distance / distance * (width - 10);
      const y = sample => 7 + (max - sample.elevation) / elevationRange * (height - 17);
      const fill = ctx.createLinearGradient(0, 0, 0, height); fill.addColorStop(0, 'rgba(56,189,248,.35)'); fill.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.beginPath(); samples.forEach((sample, index) => index ? ctx.lineTo(x(sample), y(sample)) : ctx.moveTo(x(sample), y(sample))); ctx.lineTo(width - 5, height); ctx.lineTo(5, height); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      const stroke = ctx.createLinearGradient(0, 0, width, 0); stroke.addColorStop(0, '#4edea3'); stroke.addColorStop(.4, '#38bdf8'); stroke.addColorStop(.7, '#f43f5e'); stroke.addColorStop(1, '#38bdf8');
      ctx.beginPath(); samples.forEach((sample, index) => index ? ctx.lineTo(x(sample), y(sample)) : ctx.moveTo(x(sample), y(sample))); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
    }
    const distance = $('#profileDistance')?.textContent || '—', average = $('#profileAverage')?.textContent || '—', maximum = $('#profileMaximum')?.textContent || '—';
    $('#mobileRoutesDistance').textContent = distance;
    $('#mobileRoutesAverage').textContent = average;
    $('#mobileRoutesMaximum').textContent = maximum;
    $('#mobileEditorDistance').textContent = distance;
    $('#mobileEditorElevation').textContent = hasProfile ? Math.round(samples.at(-1).elevation - samples[0].elevation) + ' m' : '—';
    $('#mobileEditorSlope').textContent = hasProfile ? maximum + ' / ' + average : '—';
  }

  function syncMobileRoutesActions() {
    const hasCourse = Boolean($('#mobileRoutesCourseSelect')?.value);
    const editBtn = $('#mobileRoutesEditBtn');
    const deleteBtn = $('#mobileRoutesDeleteBtn');
    if (editBtn) editBtn.disabled = !hasCourse;
    if (deleteBtn) deleteBtn.disabled = !hasCourse;
  }

  function renderMobileSavedRoutes() {
    renderMobileHome();
    const region = $('#mobileRoutesRegion')?.value || $('#region').value;
    const courses = state.saved.map((route, index) => ({ route, index })).filter(({ route }) => !route.region || route.region === region);
    const select = $('#mobileRoutesCourseSelect');
    if (select) {
      select.innerHTML = '<option value="">코스 미선택</option>' + courses.map(({ route, index }) => `<option value="${index}">${escapeHtml(route.name)}</option>`).join('');
      select.value = courses.some(({ index }) => String(index) === mobileSelectedSavedIndex) ? mobileSelectedSavedIndex : '';
    }
    syncMobileRoutesActions();
  }

function renderPartyCreateCourses() {
  const region = $('#partyCreateRegion')?.value;
  const screen = $('#mobilePartyCreateScreen');
  const list = $('#partyCreateCourseList');
  const names = $('#partyCreateCourseNames');
  const reset = $('#partyCreateCourseResetBtn');
  if (!region || !screen || !list || !names || !reset) return;
  const previous = new Set(JSON.parse(screen.dataset.selectedCourses || '[]'));
  const courses = state.saved.map((route, index) => ({ route, index }))
    .filter(({ route }) => route.region === region);
  const selected = courses.filter(({ index }) => previous.has(index)).map(({ index }) => index);
  screen.dataset.selectedCourses = JSON.stringify(selected);
  names.textContent = selected.length
    ? selected.map(index => state.saved[index].name).join(' · ')
    : '코스를 선택하세요';
  reset.hidden = !selected.length;
  list.innerHTML = courses.length
    ? courses.map(({ route, index }) => `<label class="party-create-course-option"><span>${escapeHtml(route.name)}</span><input type="checkbox" value="${index}" ${selected.includes(index) ? 'checked' : ''}></label>`).join('')
    : '<p>선택한 지역에 저장된 코스가 없습니다.</p>';
}

function partyGpsDistanceMeters(a, b) {
  if (!a || !b || !Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng)) || !Number.isFinite(Number(b.lat)) || !Number.isFinite(Number(b.lng))) {
    return 0;
  }
  return distanceKm([{ lng: Number(a.lng), lat: Number(a.lat) }, { lng: Number(b.lng), lat: Number(b.lat) }]) * 1000;
}

function formatPartyGpsAccuracy(accuracy) {
  const num = Number(accuracy);
  return Number.isFinite(num) && num >= 0 ? `±${Math.round(num)}m` : '정확도 —';
}

function formatPartyGpsUpdatedAt(updatedAt) {
  if (!updatedAt) return '';
  const ms = typeof updatedAt === 'number' ? updatedAt : Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'just now';
  const totalMin = Math.floor(diffSec / 60);
  if (totalMin < 60) return `${totalMin}m ago`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
}

function formatMyLocationSubtext(party = state.currentParty) {
  if (!party) return '파티 미선택';
  const sharing = isMyPartyLocationSharingEnabled(party);
  if (!sharing) return '위치 공유 꺼짐 (내 좌표 미전송)';
  const intervalSec = sanitizePartyGpsInterval(party.gps_interval_seconds);
  const modeLabel = partyGpsRuntime.powerSaveMode
    ? '정지 절전 (5분 주기 · 이동 시 자동 복귀)'
    : `전송 주기 ${intervalSec}초`;
  const myMember = getMyPartyMemberRecord(party);
  const fix = partyGpsRuntime.lastFix || (myMember && Number.isFinite(myMember.lat) ? myMember : null);
  if (!fix) return `${modeLabel} · GPS 수신 대기 중`;
  const accText = formatPartyGpsAccuracy(fix.accuracy);
  const timeText = formatPartyGpsUpdatedAt(fix.updatedAt || fix.timestamp);
  return timeText ? `${modeLabel} · ${accText} · ${timeText}` : `${modeLabel} · ${accText}`;
}

function renderPartyMemberRowHtml(member, isJoinedView = false) {
  const name = typeof member === 'string' ? member : member?.nickname || member?.name || '이름 없음';
  const isLeaderRole = member?.role === 'leader';
  const roleBadge = isLeaderRole ? '<span class="party-member-role-badge">LEADER</span>' : '';
  const status = member?.gpsStatus || 'offline';
  const statusLabel = status === 'online'
    ? '온라인'
    : status === 'off'
      ? '위치 공유 꺼짐'
      : (member?.updatedAt ? '오프라인 (지연)' : 'GPS 대기 중');
  const statusClass = status === 'online' ? 'online' : (member?.updatedAt && status !== 'off' ? 'stale' : '');
  const hasTelemetry = status !== 'off' && (Number.isFinite(member?.accuracy) || member?.updatedAt);
  const accHtml = escapeHtml(formatPartyGpsAccuracy(member?.accuracy));
  const timeStr = formatPartyGpsUpdatedAt(member?.updatedAt);
  const timeHtml = timeStr ? ` · <span class="party-member-telemetry-time">${escapeHtml(timeStr)}</span>` : '';
  const metaHtml = hasTelemetry
    ? `<span class="party-member-telemetry-meta">${accHtml}${timeHtml}</span>`
    : '';
  const rowClass = isJoinedView ? 'party-joined-member' : 'party-leader-member';
  const iconHtml = isJoinedView ? '' : '<span class="material-symbols-outlined" aria-hidden="true">person</span>';
  return `<div class="${rowClass}"><div class="party-member-main">${iconHtml}<strong>${escapeHtml(name)}</strong>${roleBadge}</div><div class="party-member-telemetry"><span class="party-member-telemetry-status ${statusClass}">${statusLabel}</span>${metaHtml}</div></div>`;
}

function clearPartyMemberMapMarkers() {
  for (const entry of partyMemberMarkers.values()) {
    try { entry.marker.remove(); } catch {}
  }
  partyMemberMarkers.clear();
}

function syncPartyMemberMapMarkers() {
  const party = state.currentParty;
  if (!party?.id || !Array.isArray(party.members)) {
    clearPartyMemberMapMarkers();
    return;
  }
  const intervalSec = sanitizePartyGpsInterval(party.gps_interval_seconds);
  const activeUserIds = new Set();
  for (const member of party.members) {
    if (!member?.user_id) continue;
    member.gpsStatus = computePartyMemberGpsStatus(member, intervalSec);
    if (member.locationSharingEnabled === false || !Number.isFinite(member.lat) || !Number.isFinite(member.lng)) {
      continue;
    }
    activeUserIds.add(member.user_id);
    const isStale = member.gpsStatus !== 'online';
    const isLeaderRole = member.role === 'leader';
    const nickname = member.nickname || '파티원';
    const accText = formatPartyGpsAccuracy(member.accuracy);
    const timeText = formatPartyGpsUpdatedAt(member.updatedAt);
    let entry = partyMemberMarkers.get(member.user_id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'party-gps-marker';
      el.innerHTML = '<div class="party-gps-marker-chip"><span class="party-gps-marker-dot"></span><span class="party-gps-marker-name"></span></div><div class="party-gps-marker-sub"></div><div class="party-gps-marker-pin"></div>';
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        const currentEntry = partyMemberMarkers.get(member.user_id);
        if (currentEntry && Number.isFinite(currentEntry.lng) && Number.isFinite(currentEntry.lat)) {
          map.easeTo({ center: [currentEntry.lng, currentEntry.lat], duration: 600 });
        }
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([member.lng, member.lat])
        .addTo(map);
      entry = { marker, el, lng: member.lng, lat: member.lat };
      partyMemberMarkers.set(member.user_id, entry);
    } else {
      entry.lng = member.lng;
      entry.lat = member.lat;
      entry.marker.setLngLat([member.lng, member.lat]);
    }
    entry.el.classList.toggle('leader', isLeaderRole);
    entry.el.classList.toggle('stale', isStale);
    const nameEl = entry.el.querySelector('.party-gps-marker-name');
    if (nameEl) nameEl.textContent = isLeaderRole ? `${nickname} (파티장)` : nickname;
    const subEl = entry.el.querySelector('.party-gps-marker-sub');
    if (subEl) {
      subEl.innerHTML = timeText
        ? `<span class="party-gps-marker-acc">${escapeHtml(accText)}</span> · <span class="party-gps-marker-time">${escapeHtml(timeText)}</span>`
        : `<span class="party-gps-marker-acc">${escapeHtml(accText)}</span>`;
    }
  }
  for (const [userId, entry] of partyMemberMarkers.entries()) {
    if (!activeUserIds.has(userId)) {
      try { entry.marker.remove(); } catch {}
      partyMemberMarkers.delete(userId);
    }
  }
}

function applyLocalMemberFix(party, userId, fix, updatedAtIso) {
  if (!party || !userId || !fix) return;
  const intervalSec = sanitizePartyGpsInterval(party.gps_interval_seconds);
  const updateList = list => {
    if (!Array.isArray(list)) return;
    const target = list.find(item => item?.user_id === userId);
    if (target) {
      target.locationSharingEnabled = true;
      target.lat = fix.lat;
      target.lng = fix.lng;
      target.accuracy = fix.accuracy;
      target.heading = fix.heading;
      target.speed = fix.speed;
      target.updatedAt = updatedAtIso;
      target.gpsStatus = computePartyMemberGpsStatus(target, intervalSec);
    }
  };
  updateList(party.members);
  const myParty = state.myParties.find(item => item.id === party.id);
  if (myParty && myParty !== party) updateList(myParty.members);
}

function clearLocalMemberFix(party, userId, sharingEnabled = false) {
  if (!party || !userId) return;
  const updateList = list => {
    if (!Array.isArray(list)) return;
    const target = list.find(item => item?.user_id === userId);
    if (target) {
      target.locationSharingEnabled = sharingEnabled;
      target.lat = null;
      target.lng = null;
      target.accuracy = null;
      target.heading = null;
      target.speed = null;
      target.updatedAt = null;
      target.gpsStatus = sharingEnabled ? 'offline' : 'off';
    }
  };
  updateList(party.members);
  const myParty = state.myParties.find(item => item.id === party.id);
  if (myParty && myParty !== party) updateList(myParty.members);
}

async function sendCurrentPartyGpsFix(force = false) {
  const party = state.currentParty;
  const client = supabaseClient;
  const userId = state.session?.user?.id;
  const fix = partyGpsRuntime.lastFix;
  if (!party?.id || !client || !userId || state.profile?.status !== 'approved') return;
  if (!isMyPartyLocationSharingEnabled(party) || !fix || partyGpsRuntime.sending) return;
  const intervalMs = partyGpsRuntime.powerSaveMode
    ? PARTY_GPS_STATIONARY_INTERVAL_MS
    : sanitizePartyGpsInterval(party.gps_interval_seconds) * 1000;
  if (!force && partyGpsRuntime.lastSentAt && (Date.now() - partyGpsRuntime.lastSentAt) < Math.max(3000, intervalMs - 500)) {
    return;
  }
  partyGpsRuntime.sending = true;
  try {
    const { data, error } = await client.rpc('upsert_my_party_location', {
      p_party_id: party.id,
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy_m: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
      p_heading: Number.isFinite(fix.heading) ? fix.heading : null,
      p_speed_mps: Number.isFinite(fix.speed) ? fix.speed : null
    });
    if (client !== supabaseClient || state.currentParty !== party) return;
    const updatedIso = typeof data === 'string' && data ? data : new Date().toISOString();
    if (!error || ['PGRST202', '42883'].includes(error.code)) {
      partyGpsRuntime.lastSentAt = Date.now();
      partyGpsRuntime.lastFix = { ...fix, updatedAt: updatedIso };
      applyLocalMemberFix(party, userId, fix, updatedIso);
      syncPartyMemberMapMarkers();
      refreshVisiblePartyScreens();
    }
  } catch (err) {
    console.warn('upsert_my_party_location error:', err);
  } finally {
    partyGpsRuntime.sending = false;
  }
}

async function refreshCurrentPartyMemberLocations() {
  const party = state.currentParty;
  const client = supabaseClient;
  const userId = state.session?.user?.id;
  if (!party?.id || !client || !userId || state.profile?.status !== 'approved' || partyGpsRuntime.polling) return;
  partyGpsRuntime.polling = true;
  try {
    const { rows, hasLocationRpc } = await fetchMyPartyMemberRows(client, party.id);
    if (client !== supabaseClient || state.session?.user?.id !== userId || state.currentParty !== party) return;
    if (!hasLocationRpc) {
      syncPartyMemberMapMarkers();
      refreshVisiblePartyScreens();
      return;
    }
    const partyRows = (rows || []).filter(row => row.party_id === party.id);
    if (partyRows[0]?.gps_interval_seconds) {
      const nextInterval = sanitizePartyGpsInterval(partyRows[0].gps_interval_seconds);
      if (party.gps_interval_seconds !== nextInterval) {
        party.gps_interval_seconds = nextInterval;
        schedulePartyGpsTimer();
      }
    }
    const intervalSec = sanitizePartyGpsInterval(party.gps_interval_seconds);
    const normalized = partyRows.map(row => normalizePartyMemberRow(row, intervalSec)).filter(Boolean);
    if (normalized.length) {
      party.members = normalized;
      const myMember = normalized.find(m => m.user_id === userId);
      if (myMember) party.myLocationSharingEnabled = myMember.locationSharingEnabled;
      const myParty = state.myParties.find(item => item.id === party.id);
      if (myParty) {
        myParty.gps_interval_seconds = party.gps_interval_seconds;
        myParty.members = normalized;
      }
    }
    syncPartyMemberMapMarkers();
    refreshVisiblePartyScreens();
  } catch (err) {
    console.warn('refreshCurrentPartyMemberLocations error:', err);
  } finally {
    partyGpsRuntime.polling = false;
  }
}

function refreshVisiblePartyScreens() {
  const view = document.body.dataset.mobileView;
  if (view === 'party-leader') renderPartyLeader();
  else if (view === 'party-joined') renderPartyJoined();
}

function handlePartyGpsCoords(coords, timestamp = Date.now()) {
  const lat = Number(coords?.latitude);
  const lng = Number(coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const accuracy = Number.isFinite(Number(coords?.accuracy)) && Number(coords.accuracy) >= 0 ? Number(coords.accuracy) : null;
  const heading = Number.isFinite(Number(coords?.heading)) && Number(coords.heading) >= 0 && Number(coords.heading) <= 360 ? Number(coords.heading) : null;
  const speed = Number.isFinite(Number(coords?.speed)) && Number(coords.speed) >= 0 ? Number(coords.speed) : null;
  const now = Date.now();
  const nextFix = {
    lat,
    lng,
    accuracy,
    heading,
    speed,
    timestamp: Number.isFinite(Number(timestamp)) ? Number(timestamp) : now,
    updatedAt: new Date(now).toISOString()
  };
  partyGpsRuntime.lastFix = nextFix;
  syncMyLocationBlueDotFromFix(coords, timestamp);

  const moveThresholdM = Math.max(PARTY_GPS_MOVE_MIN_METERS, Math.min(accuracy || PARTY_GPS_MOVE_MIN_METERS, 35));
  if (!partyGpsRuntime.anchorFix) {
    partyGpsRuntime.anchorFix = { lat, lng, since: now };
  } else {
    const movedMeters = partyGpsDistanceMeters(partyGpsRuntime.anchorFix, nextFix);
    const isMoving = movedMeters >= moveThresholdM || (speed !== null && speed >= 1.0);
    if (isMoving) {
      partyGpsRuntime.anchorFix = { lat, lng, since: now };
      if (partyGpsRuntime.powerSaveMode) {
        partyGpsRuntime.powerSaveMode = false;
        schedulePartyGpsTimer();
        sendCurrentPartyGpsFix(true);
        return;
      }
    } else if (!partyGpsRuntime.powerSaveMode && (now - partyGpsRuntime.anchorFix.since) >= PARTY_GPS_STATIONARY_HOLD_MS) {
      partyGpsRuntime.powerSaveMode = true;
      schedulePartyGpsTimer();
    }
  }

  const party = state.currentParty;
  const userId = state.session?.user?.id;
  if (party && userId && isMyPartyLocationSharingEnabled(party)) {
    applyLocalMemberFix(party, userId, nextFix, nextFix.updatedAt);
    syncPartyMemberMapMarkers();
    refreshVisiblePartyScreens();
    sendCurrentPartyGpsFix(false);
  }
}

function handlePartyGeolocateEvent(event) {
  if (event?.coords) {
    handlePartyGpsCoords(event.coords, event.timestamp);
  }
}

function stopPartyGpsWatcher() {
  if (partyGpsRuntime.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
    try { navigator.geolocation.clearWatch(partyGpsRuntime.watchId); } catch {}
  }
  partyGpsRuntime.watchId = null;
  partyGpsRuntime.anchorFix = null;
  partyGpsRuntime.powerSaveMode = false;
  partyGpsRuntime.lastSentAt = 0;
}

function stopPartyGpsRuntime({ clearMarkers = false } = {}) {
  stopPartyGpsWatcher();
  if (partyGpsRuntime.syncTimer !== null) {
    clearInterval(partyGpsRuntime.syncTimer);
    partyGpsRuntime.syncTimer = null;
  }
  partyGpsRuntime.partyId = '';
  if (clearMarkers) clearPartyMemberMapMarkers();
}

function startPartyGpsWatcher() {
  if (partyGpsRuntime.watchId !== null || typeof navigator === 'undefined' || !navigator.geolocation) return;
  try {
    partyGpsRuntime.watchId = navigator.geolocation.watchPosition(
      pos => handlePartyGpsCoords(pos.coords, pos.timestamp),
      err => { console.warn('Party GPS watch error:', err); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  } catch (err) {
    console.warn('Failed to start party GPS watch:', err);
  }
}

function schedulePartyGpsTimer() {
  if (partyGpsRuntime.syncTimer !== null) {
    clearInterval(partyGpsRuntime.syncTimer);
    partyGpsRuntime.syncTimer = null;
  }
  const party = state.currentParty;
  if (!party?.id || !state.session?.user || state.profile?.status !== 'approved') return;
  const sharing = isMyPartyLocationSharingEnabled(party);
  const normalIntervalMs = sanitizePartyGpsInterval(party.gps_interval_seconds) * 1000;
  const tickMs = sharing && partyGpsRuntime.powerSaveMode
    ? PARTY_GPS_STATIONARY_INTERVAL_MS
    : normalIntervalMs;
  partyGpsRuntime.syncTimer = setInterval(() => {
    if (!state.currentParty || state.currentParty.id !== party.id) return;
    if (isMyPartyLocationSharingEnabled(state.currentParty)) {
      if (partyGpsRuntime.lastFix && !partyGpsRuntime.powerSaveMode && partyGpsRuntime.anchorFix) {
        if ((Date.now() - partyGpsRuntime.anchorFix.since) >= PARTY_GPS_STATIONARY_HOLD_MS) {
          partyGpsRuntime.powerSaveMode = true;
          schedulePartyGpsTimer();
          refreshVisiblePartyScreens();
        }
      }
      sendCurrentPartyGpsFix(true);
    }
    refreshCurrentPartyMemberLocations();
  }, tickMs);
}

function syncPartyGpsRuntimeForCurrentParty() {
  const party = state.currentParty;
  if (!party?.id || !state.session?.user || state.profile?.status !== 'approved') {
    stopPartyGpsRuntime({ clearMarkers: true });
    return;
  }
  if (partyGpsRuntime.partyId && partyGpsRuntime.partyId !== party.id) {
    clearPartyMemberMapMarkers();
    partyGpsRuntime.lastSentAt = 0;
  }
  partyGpsRuntime.partyId = party.id;
  if (isMyPartyLocationSharingEnabled(party)) {
    startPartyGpsWatcher();
    if (partyGpsRuntime.lastFix) sendCurrentPartyGpsFix(true);
  } else {
    stopPartyGpsWatcher();
  }
  schedulePartyGpsTimer();
}

async function toggleMyPartyLocationSharing(nextEnabled) {
  const party = state.currentParty;
  const userId = state.session?.user?.id;
  if (!party?.id || !supabaseClient || !userId || state.profile?.status !== 'approved') return;
  const enabled = Boolean(nextEnabled);
  party.myLocationSharingEnabled = enabled;
  if (!enabled) {
    stopPartyGpsWatcher();
    clearLocalMemberFix(party, userId, false);
    syncPartyMemberMapMarkers();
    triggerMyLocationGps({ center: false });
  } else {
    const myMember = getMyPartyMemberRecord(party);
    if (myMember) myMember.locationSharingEnabled = true;
    if (partyGpsRuntime.lastFix) {
      applyLocalMemberFix(party, userId, partyGpsRuntime.lastFix, new Date().toISOString());
      syncPartyMemberMapMarkers();
    }
    startPartyGpsWatcher();
  }
  schedulePartyGpsTimer();
  refreshVisiblePartyScreens();
  const client = supabaseClient;
  try {
    const { error } = await client.rpc('set_my_party_location_sharing', {
      p_party_id: party.id,
      p_enabled: enabled
    });
    if (client !== supabaseClient || state.currentParty !== party) return;
    if (error && !['PGRST202', '42883'].includes(error.code)) {
      toast(error.message || '위치 공유 설정 변경에 실패했습니다.');
      return;
    }
    if (enabled && partyGpsRuntime.lastFix) {
      await sendCurrentPartyGpsFix(true);
    }
    toast(enabled ? '내 위치 공유를 켰습니다.' : '내 위치 공유를 껐습니다. 저장된 위치가 삭제되었습니다.');
  } catch (err) {
    toast(err?.message || '위치 공유 설정 변경 중 오류가 발생했습니다.');
  }
}

async function setPartyLeaderGpsInterval(intervalSeconds) {
  const party = state.currentParty;
  const nextSec = sanitizePartyGpsInterval(intervalSeconds);
  if (!party?.id || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved') return;
  if (party.leader_id !== state.session.user.id) {
    toast('파티장만 GPS 전송 주기를 변경할 수 있습니다.');
    return;
  }
  if (sanitizePartyGpsInterval(party.gps_interval_seconds) === nextSec) return;
  party.gps_interval_seconds = nextSec;
  const myParty = state.myParties.find(item => item.id === party.id);
  if (myParty) myParty.gps_interval_seconds = nextSec;
  schedulePartyGpsTimer();
  renderPartyLeader();
  const client = supabaseClient;
  try {
    const { error } = await client.rpc('set_party_gps_interval', {
      p_party_id: party.id,
      p_interval_seconds: nextSec
    });
    if (client !== supabaseClient || state.currentParty !== party) return;
    if (error && !['PGRST202', '42883'].includes(error.code)) {
      toast(error.message || 'GPS 전송 주기 변경에 실패했습니다.');
      return;
    }
    toast(`파티 GPS 전송 주기를 ${nextSec}초로 설정했습니다.`);
  } catch (err) {
    toast(err?.message || 'GPS 전송 주기 변경 중 오류가 발생했습니다.');
  }
}

async function leaveCurrentParty() {
  const party = state.currentParty;
  const modal = $('#partyJoinedLeaveModal');
  const confirmButton = $('#partyJoinedLeaveConfirmBtn');
  const closeButton = $('#partyJoinedLeaveCloseBtn');
  if (!party?.id || !modal || !confirmButton || confirmButton.disabled || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved') return;
  if (party.leader_id === state.session.user.id) {
    toast('파티장은 탈퇴 대신 파티 해산을 사용하세요.');
    return;
  }
  const client = supabaseClient;
  const userId = state.session.user.id;
  const partyId = party.id;
  confirmButton.disabled = true;
  if (closeButton) closeButton.disabled = true;
  try {
    stopPartyGpsRuntime({ clearMarkers: true });
    try { await client.rpc('clear_my_party_location', { p_party_id: partyId }); } catch {}
    const { error } = await client.rpc('leave_party', { p_party_id: partyId });
    if (client !== supabaseClient || state.session?.user?.id !== userId) return;
    if (error) throw error;
    modal.hidden = true;
    await loadMyParties();
    setMobileAppView('party');
    toast('파티에서 탈퇴했으며 내 공유 위치가 삭제되었습니다.');
  } catch (error) {
    toast(
      ['PGRST202', '42883'].includes(error?.code)
        ? '파티 탈퇴 기능(leave_party)이 DB에 아직 적용되지 않았습니다.'
        : (error?.message || '파티 탈퇴에 실패했습니다.')
    );
  } finally {
    confirmButton.disabled = false;
    if (closeButton) closeButton.disabled = false;
  }
}

async function disbandCurrentParty() {
  const party = state.currentParty;
  const modal = $('#partyLeaderDisbandModal');
  const confirmButton = $('#partyLeaderDisbandConfirmBtn');
  const closeButton = $('#partyLeaderDisbandCloseBtn');
  if (!party?.id || !modal || !confirmButton || confirmButton.disabled || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved') return;
  if (party.leader_id !== state.session.user.id) {
    toast('파티장만 파티를 해산할 수 있습니다.');
    return;
  }
  const client = supabaseClient;
  const userId = state.session.user.id;
  const partyId = party.id;
  confirmButton.disabled = true;
  if (closeButton) closeButton.disabled = true;
  try {
    stopPartyGpsRuntime({ clearMarkers: true });
    try { await client.rpc('clear_my_party_location', { p_party_id: partyId }); } catch {}
    const {error} = await client.rpc('disband_party', {p_party_id:partyId});
    if (client !== supabaseClient || state.session?.user?.id !== userId) return;
    if (error) throw error;
    modal.hidden = true;
    await loadMyParties();
    setMobileAppView('party');
    toast('파티를 해산했으며 파티원 공유 위치가 모두 삭제되었습니다.');
  } catch (error) {
    toast(error?.message || '파티 해산에 실패했습니다.');
  } finally {
    confirmButton.disabled = false;
    if (closeButton) closeButton.disabled = false;
  }
}

function renderPartyLeader() {
  const party = state.currentParty;
  const intervalSec = sanitizePartyGpsInterval(party?.gps_interval_seconds);
  const members = Array.isArray(party?.members) ? party.members : [];
  for (const member of members) {
    if (member && typeof member === 'object') {
      member.gpsStatus = computePartyMemberGpsStatus(member, intervalSec);
    }
  }
  const routeIds = Array.isArray(party?.route_ids) ? party.route_ids.filter(Boolean) : [];
  const courses = resolvePartySharedCourses(party);
  const activeRouteId = party?.active_route_id || courses.find(course => course?.isActive)?.id || '';
  const selectedRouteId = courses.some(course => course.id === party?.selectedRouteId)
    ? party.selectedRouteId
    : courses.some(course => course.id === activeRouteId)
      ? activeRouteId
      : courses[0]?.id || '';
  const sharedCourse = courses.find(course => course.id === selectedRouteId) || party?.sharedCourse;
  const activeCourse = courses.find(course => course.id === activeRouteId) || sharedCourse;
  if (party) {
    party.sharedCourses = courses;
    party.selectedRouteId = sharedCourse?.id || '';
    party.sharedCourse = sharedCourse;
  }
  const busy = Boolean(party?.savingActiveRoute || party?.savingCourseAction);
  $('#partyLeaderName').textContent = typeof party?.name === 'string' && party.name.trim() ? party.name : '파티 정보가 없습니다';
  $('#partyLeaderCount').textContent = Array.isArray(party?.members) ? `${members.length}명` : '—';
  $('#partyLeaderCourseName').textContent = typeof activeCourse?.name === 'string' && activeCourse.name.trim() ? activeCourse.name : '공유 코스가 없습니다';
  $('#partyLeaderCourseDistance').textContent = Number.isFinite(activeCourse?.km) ? `${activeCourse.km.toFixed(1)} km` : '';

  const addSelectEl = $('#partyLeaderAddCourseSelect');
  const addBtnEl = $('#partyLeaderAddCourseBtn');
  if (addSelectEl && addBtnEl) {
    const availableCourses = state.saved.filter(
      route => route?.source === 'cloud' && route.id && route.region === party?.region && !routeIds.includes(route.id)
    );
    const previousAddId = addSelectEl.value;
    addSelectEl.innerHTML = availableCourses.length
      ? availableCourses.map(route => {
          const distLabel = Number.isFinite(route.km) ? ` (${route.km.toFixed(1)} km)` : '';
          return `<option value="${escapeHtml(route.id)}">${escapeHtml((route.name || '이름 없는 코스') + distLabel)}</option>`;
        }).join('')
      : '<option value="">추가 가능한 내 코스가 없습니다</option>';
    if (availableCourses.some(route => route.id === previousAddId)) {
      addSelectEl.value = previousAddId;
    } else if (availableCourses[0]?.id) {
      addSelectEl.value = availableCourses[0].id;
    }
    addSelectEl.disabled = !party?.id || !availableCourses.length || busy;
    addBtnEl.disabled = !party?.id || !availableCourses.length || busy;
    const addLabel = addBtnEl.querySelector('span:last-child');
    if (addLabel) addLabel.textContent = party?.savingCourseAction === 'add' ? '추가 중...' : '코스 추가';
  }

  const courseListEl = $('#partyLeaderCourseList');
  if (courseListEl) {
    courseListEl.innerHTML = courses.length ? courses.map(course => {
      const selected = course.id === sharedCourse?.id;
      const isActive = course.id === activeRouteId;
      const dist = Number.isFinite(course.km) ? `<span>${course.km.toFixed(1)} km</span>` : '';
      const activeBadge = isActive ? '<span class="party-leader-course-badge">ACTIVE</span>' : '';
      const courseIdAttr = escapeHtml(course.id || '');
      return `<div class="party-leader-course-item${selected ? ' selected' : ''}"><button type="button" class="party-leader-course-option" role="radio" aria-checked="${selected}" data-party-course-id="${courseIdAttr}" ${busy ? 'disabled' : ''}><span class="party-leader-course-option-main"><span class="material-symbols-outlined" aria-hidden="true">${selected ? 'radio_button_checked' : 'radio_button_unchecked'}</span><strong>${escapeHtml(course.name || '이름 없는 코스')}</strong></span><span class="party-leader-course-option-meta">${activeBadge}${dist}</span></button><div class="party-leader-course-item-actions"><button type="button" class="party-leader-course-mini-btn" data-party-preview-id="${courseIdAttr}" ${busy ? 'disabled' : ''}><span class="material-symbols-outlined" aria-hidden="true">map</span><span>미리보기</span></button><button type="button" class="party-leader-course-mini-btn danger" data-party-remove-id="${courseIdAttr}" ${busy ? 'disabled' : ''}><span class="material-symbols-outlined" aria-hidden="true">close</span><span>제거</span></button></div></div>`;
    }).join('') : '<p class="party-leader-course-empty">등록된 파티 코스가 없습니다.</p>';
  }
  const errorEl = $('#partyLeaderCourseError');
  if (errorEl) {
    const errorMsg = typeof party?.courseError === 'string' ? party.courseError.trim() : '';
    errorEl.textContent = errorMsg;
    errorEl.hidden = !errorMsg;
  }
  const setActiveBtn = $('#partyLeaderSetActiveBtn');
  if (setActiveBtn) {
    const alreadyActive = Boolean(sharedCourse?.id && sharedCourse.id === activeRouteId);
    setActiveBtn.disabled = !party?.id || !sharedCourse?.id || alreadyActive || busy;
    const activeLabel = setActiveBtn.querySelector('span:last-child');
    if (activeLabel) {
      activeLabel.textContent = party?.savingCourseAction === 'active'
        ? '변경 중...'
        : alreadyActive
          ? '현재 ACTIVE'
          : '활성 코스 변경';
    }
  }
  const rideBtn = $('#partyLeaderRideOnBtn');
  if (rideBtn) {
    rideBtn.disabled = !party?.id || !sharedCourse?.id || busy;
    const labelSpan = rideBtn.querySelector('span:last-child');
    if (labelSpan) labelSpan.textContent = party?.savingActiveRoute ? '코스 저장 중...' : '파티 RIDE ON';
  }

  const leaderLocToggle = $('#partyLeaderLocationToggle');
  if (leaderLocToggle) {
    leaderLocToggle.setAttribute('aria-checked', String(isMyPartyLocationSharingEnabled(party)));
    leaderLocToggle.disabled = !party?.id;
  }
  const leaderLocSubtext = $('#partyLeaderLocationSubtext');
  if (leaderLocSubtext) {
    leaderLocSubtext.textContent = formatMyLocationSubtext(party);
  }
  const intervalGroup = $('#partyLeaderGpsIntervalGroup');
  if (intervalGroup) {
    intervalGroup.querySelectorAll('[data-gps-interval]').forEach(btn => {
      const btnVal = Number(btn.dataset.gpsInterval);
      btn.setAttribute('aria-pressed', String(btnVal === intervalSec));
      btn.disabled = !party?.id;
    });
  }
  const leaderGpsStatusEl = $('#partyLeaderGpsStatus');
  if (leaderGpsStatusEl) {
    const online = members.filter(member => member?.gpsStatus === 'online').length;
    const offCount = members.filter(member => member?.gpsStatus === 'off').length;
    const offline = Math.max(0, members.length - online - offCount);
    leaderGpsStatusEl.textContent = members.length
      ? `온라인 ${online}명 · 대기/오프라인 ${offline}명${offCount ? ` · 공유 꺼짐 ${offCount}명` : ''}`
      : 'GPS 상태 정보가 없습니다.';
  }

  $('#partyLeaderMembers').innerHTML = members.length
    ? members.map(member => renderPartyMemberRowHtml(member, false)).join('')
    : '<p>표시할 파티원이 없습니다.</p>';
}

  function previewPartyCourse(routeId) {
    const party = state.currentParty;
    if (!routeId || !party) return;
    const courses = resolvePartySharedCourses(party);
    const course = courses.find(item => item?.id === routeId)
      || state.saved.find(item => item?.id === routeId);
    if (!course || !Array.isArray(course.points) || course.points.length < 2) {
      toast('미리보기할 코스 좌표를 불러올 수 없습니다.');
      return;
    }
    const targetRegion = course.region || party.region;
    const srcRegion = $('#region');
    if (targetRegion && srcRegion && srcRegion.value !== targetRegion && regions[targetRegion]) {
      srcRegion.value = targetRegion;
      srcRegion.dispatchEvent(new Event('change'));
    }
    applySavedRoute(course, 'map');
  }

  async function addPartyLeaderCourse() {
    const party = state.currentParty;
    if (!party || party.savingActiveRoute || party.savingCourseAction) return;
    const setCourseError = message => {
      party.courseError = message;
      renderPartyLeader();
      toast(message);
    };
    if (!party.id || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved' || party.leader_id !== state.session.user.id) {
      setCourseError('파티장 권한이 있는 승인 회원만 코스를 추가할 수 있습니다.');
      return;
    }
    const routeId = $('#partyLeaderAddCourseSelect')?.value || '';
    const selectedCourse = state.saved.find(route => route.source === 'cloud' && route.id === routeId && route.region === party.region);
    if (!routeId || !selectedCourse) {
      setCourseError('추가할 내 코스를 선택하세요.');
      return;
    }
    const currentRouteIds = Array.isArray(party.route_ids) ? party.route_ids.filter(Boolean) : [];
    if (currentRouteIds.includes(routeId)) {
      setCourseError('이미 파티에 등록된 코스입니다.');
      return;
    }
    party.savingCourseAction = 'add';
    party.courseError = '';
    renderPartyLeader();
    const client = supabaseClient;
    const userId = state.session.user.id;
    try {
      const { data, error } = await client.rpc('add_party_route', {
        p_party_id: party.id,
        p_route_id: routeId
      });
      if (client !== supabaseClient || state.session?.user?.id !== userId || state.currentParty !== party) return;
      party.savingCourseAction = '';
      if (error) {
        setCourseError(
          ['PGRST202', '42883'].includes(error.code)
            ? '파티 코스 추가 기능(add_party_route)이 DB에 아직 적용되지 않았습니다.'
            : (error.message || '파티 코스 추가에 실패했습니다.')
        );
        return;
      }
      const nextRouteIds = Array.isArray(data) && data.length ? data : [...currentRouteIds, routeId];
      party.route_ids = nextRouteIds;
      if (!party.active_route_id) party.active_route_id = routeId;
      if (Array.isArray(party.partyRoutes) && !party.partyRoutes.some(route => route.id === routeId)) {
        party.partyRoutes = [...party.partyRoutes, { ...selectedCourse, isActive: party.active_route_id === routeId }];
      }
      party.selectedRouteId = routeId;
      const myParty = state.myParties.find(item => item.id === party.id);
      if (myParty) {
        myParty.route_ids = nextRouteIds;
        myParty.active_route_id = party.active_route_id;
        myParty.partyRoutes = party.partyRoutes;
      }
      renderPartyLeader();
      toast('파티 코스를 추가했습니다.');
    } catch (error) {
      if (state.currentParty === party) {
        party.savingCourseAction = '';
        setCourseError(error?.message || '파티 코스 추가 중 오류가 발생했습니다.');
      }
    }
  }

  async function removePartyLeaderCourse(routeId) {
    const party = state.currentParty;
    if (!party || !routeId || party.savingActiveRoute || party.savingCourseAction) return;
    const setCourseError = message => {
      party.courseError = message;
      renderPartyLeader();
      toast(message);
    };
    if (!party.id || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved' || party.leader_id !== state.session.user.id) {
      setCourseError('파티장 권한이 있는 승인 회원만 코스를 제거할 수 있습니다.');
      return;
    }
    const currentRouteIds = Array.isArray(party.route_ids) ? party.route_ids.filter(Boolean) : [];
    if (!currentRouteIds.includes(routeId)) {
      setCourseError('파티에 등록되지 않은 코스입니다.');
      return;
    }
    party.savingCourseAction = 'remove';
    party.courseError = '';
    renderPartyLeader();
    const client = supabaseClient;
    const userId = state.session.user.id;
    try {
      const { data, error } = await client.rpc('remove_party_route', {
        p_party_id: party.id,
        p_route_id: routeId
      });
      if (client !== supabaseClient || state.session?.user?.id !== userId || state.currentParty !== party) return;
      party.savingCourseAction = '';
      if (error) {
        setCourseError(
          ['PGRST202', '42883'].includes(error.code)
            ? '파티 코스 제거 기능(remove_party_route)이 DB에 아직 적용되지 않았습니다.'
            : (error.message || '파티 코스 제거에 실패했습니다.')
        );
        return;
      }
      const nextRouteIds = Array.isArray(data) ? data : currentRouteIds.filter(id => id !== routeId);
      party.route_ids = nextRouteIds;
      if (party.active_route_id === routeId) {
        party.active_route_id = nextRouteIds[0] || null;
      }
      if (Array.isArray(party.partyRoutes)) {
        party.partyRoutes = party.partyRoutes
          .filter(route => route.id !== routeId)
          .map(route => ({ ...route, isActive: route.id === party.active_route_id }));
      }
      if (party.selectedRouteId === routeId) {
        party.selectedRouteId = party.active_route_id || nextRouteIds[0] || '';
      }
      const myParty = state.myParties.find(item => item.id === party.id);
      if (myParty) {
        myParty.route_ids = nextRouteIds;
        myParty.active_route_id = party.active_route_id;
        myParty.partyRoutes = party.partyRoutes;
      }
      renderPartyLeader();
      toast('파티 목록에서 코스를 제거했습니다.');
    } catch (error) {
      if (state.currentParty === party) {
        party.savingCourseAction = '';
        setCourseError(error?.message || '파티 코스 제거 중 오류가 발생했습니다.');
      }
    }
  }

  async function savePartyLeaderActiveCourse() {
    const party = state.currentParty;
    if (!party || party.savingActiveRoute || party.savingCourseAction) return;
    const setCourseError = message => {
      party.courseError = message;
      renderPartyLeader();
      toast(message);
    };
    if (!party.id || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved' || party.leader_id !== state.session.user.id) {
      setCourseError('파티장 권한이 있는 승인 회원만 활성 코스를 변경할 수 있습니다.');
      return;
    }
    const routeId = party.selectedRouteId;
    const routeIds = Array.isArray(party.route_ids) ? party.route_ids : [];
    const selectedCourse = state.saved.find(route => route.source === 'cloud' && route.id === routeId)
      || party.sharedCourses?.find(route => route.id === routeId);
    if (!routeId || !selectedCourse || !routeIds.includes(routeId)) {
      setCourseError('파티에 등록된 코스를 하나 선택하세요.');
      return;
    }
    if (party.active_route_id === routeId) return;
    party.savingCourseAction = 'active';
    party.courseError = '';
    renderPartyLeader();
    const client = supabaseClient;
    const userId = state.session.user.id;
    try {
      const { data, error } = await client.rpc('set_party_active_route', {
        p_party_id: party.id,
        p_route_id: routeId
      });
      if (client !== supabaseClient || state.session?.user?.id !== userId || state.currentParty !== party) return;
      party.savingCourseAction = '';
      if (error) {
        setCourseError(
          ['PGRST202', '42883'].includes(error.code)
            ? '파티 활성 코스 변경 기능(set_party_active_route)이 DB에 아직 적용되지 않았습니다.'
            : (error.message || '활성 코스 변경에 실패했습니다.')
        );
        return;
      }
      const savedRouteId = data || routeId;
      party.active_route_id = savedRouteId;
      party.selectedRouteId = savedRouteId;
      party.sharedCourse = selectedCourse;
      if (Array.isArray(party.partyRoutes)) {
        party.partyRoutes = party.partyRoutes.map(route => ({ ...route, isActive: route.id === savedRouteId }));
      }
      const myParty = state.myParties.find(item => item.id === party.id);
      if (myParty) {
        myParty.active_route_id = savedRouteId;
        myParty.partyRoutes = party.partyRoutes;
      }
      renderPartyLeader();
      toast('활성 코스를 변경했습니다.');
    } catch (error) {
      if (state.currentParty === party) {
        party.savingCourseAction = '';
        setCourseError(error?.message || '활성 코스 변경 중 오류가 발생했습니다.');
      }
    }
  }

  async function startPartyLeaderRideOn() {
    const party = state.currentParty;
    if (!party || party.savingActiveRoute || party.savingCourseAction) return;
    const setCourseError = message => {
      party.courseError = message;
      renderPartyLeader();
      toast(message);
    };
    if (!party.id || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved' || party.leader_id !== state.session.user.id) {
      setCourseError('파티장 권한이 있는 승인 회원만 파티 RIDE ON을 실행할 수 있습니다.');
      return;
    }
    const routeId = party.selectedRouteId;
    const routeIds = Array.isArray(party.route_ids) ? party.route_ids : [];
    const selectedCourse = state.saved.find(route => route.source === 'cloud' && route.id === routeId)
      || party.sharedCourses?.find(route => route.id === routeId);
    if (!routeId || !selectedCourse || !routeIds.includes(routeId)) {
      setCourseError('파티에 등록된 코스를 하나 선택하세요.');
      return;
    }
    party.savingActiveRoute = true;
    party.courseError = '';
    renderPartyLeader();
    const client = supabaseClient;
    const userId = state.session.user.id;
    try {
      const { data, error } = await client.rpc('set_party_active_route', {
        p_party_id: party.id,
        p_route_id: routeId
      });
      if (client !== supabaseClient || state.session?.user?.id !== userId || state.currentParty !== party) return;
      if (error) {
        party.savingActiveRoute = false;
        setCourseError(
          ['PGRST202', '42883'].includes(error.code)
            ? '파티 활성 코스 변경 기능(set_party_active_route)이 DB에 아직 적용되지 않았습니다.'
            : (error.message || '활성 코스 저장에 실패했습니다.')
        );
        return;
      }
      const savedRouteId = data || routeId;
      party.savingActiveRoute = false;
      party.active_route_id = savedRouteId;
      party.selectedRouteId = savedRouteId;
      party.sharedCourse = selectedCourse;
      const myParty = state.myParties.find(item => item.id === party.id);
      if (myParty) myParty.active_route_id = savedRouteId;
      renderPartyLeader();

      const targetRegion = selectedCourse.region || party.region;
      const savedIndex = state.saved.findIndex(route => route.id === selectedCourse.id);
      const homeRegionSel = $('#homeRegionSelect');
      const homeCourseSel = $('#homeCourseSelect');
      if (savedIndex >= 0 && homeRegionSel && homeCourseSel && targetRegion && regions[targetRegion]) {
        homeRegionSel.value = targetRegion;
        renderMobileHome();
        homeCourseSel.value = String(savedIndex);
        mobileHomeRideOn('ride');
      } else {
        const srcRegion = $('#region');
        if (targetRegion && srcRegion && srcRegion.value !== targetRegion && regions[targetRegion]) {
          srcRegion.value = targetRegion;
          srcRegion.dispatchEvent(new Event('change'));
        }
        applySavedRoute(selectedCourse, 'ride');
      }
    } catch (error) {
      if (state.currentParty === party) {
        party.savingActiveRoute = false;
        setCourseError(error?.message || '활성 코스 저장 중 오류가 발생했습니다.');
      }
    }
    syncPartyGpsRuntimeForCurrentParty();
    refreshCurrentPartyMemberLocations();
  }

  function renderPartyInviteResults() {
    const query = $('#partyInviteSearchInput')?.value.trim().toLocaleLowerCase() || '';
    const candidates = Array.isArray(state.currentParty?.inviteCandidates) ? state.currentParty.inviteCandidates : [];
    const matches = candidates.filter(candidate => typeof candidate?.nickname === 'string' && candidate.nickname.trim() && candidate.nickname.toLocaleLowerCase().includes(query));
    $('#partyInviteResultCount').textContent = `결과 ${matches.length}건`;
    $('#partyInviteResults').innerHTML = matches.length ? matches.map(candidate => {
      const status = candidate.invite_status || candidate.partyStatus || candidate.inviteStatus;
      const action = status === 'joined' || status === 'member'
        ? '<span class="party-invite-state joined"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>참여중</span>'
        : status === 'pending' || status === 'invited'
          ? '<button class="party-invite-state pending" type="button" disabled><span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span>초대 대기중</button>'
          : `<button class="party-invite-state" type="button" data-invite-user-id="${escapeHtml(candidate.user_id)}"><span class="material-symbols-outlined" aria-hidden="true">person_add</span>초대 요청</button>`;
      return `<div class="party-invite-result"><strong>${escapeHtml(candidate.nickname)}</strong>${action}</div>`;
    }).join('') : `<div class="party-invite-empty"><span class="material-symbols-outlined" aria-hidden="true">person_search</span><p>${query ? '검색 결과가 없습니다.' : '표시할 회원이 없습니다.'}</p></div>`;
  }

  async function searchPartyInviteCandidates() {
    const party = state.currentParty;
    const query = $('#partyInviteSearchInput')?.value.trim() || '';
    if (party) party.inviteCandidates = [];
    renderPartyInviteResults();
    if (!query) return;
    if (query.length > 50) { toast('닉네임은 50자 이내로 검색하세요.'); return; }
    if (!party?.id || party.leader_id !== state.session?.user?.id || state.profile?.status !== 'approved' || !supabaseClient) {
      toast('파티장만 회원을 검색할 수 있습니다.');
      return;
    }
    const client = supabaseClient;
    const { data, error } = await client.rpc('search_party_invite_candidates', { p_party_id: party.id, p_query: query });
    if (client !== supabaseClient || state.currentParty !== party || $('#partyInviteSearchInput')?.value.trim() !== query) return;
    if (error) { toast(error.message); return; }
    party.inviteCandidates = data || [];
    renderPartyInviteResults();
  }

  async function sendPartyInvite(userId, button) {
    const party = state.currentParty;
    if (!party?.id || party.leader_id !== state.session?.user?.id || state.profile?.status !== 'approved' || !supabaseClient) return;
    const candidate = party.inviteCandidates?.find(item => item.user_id === userId);
    if (!candidate || candidate.invite_status !== 'available') return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('send_party_invitation', { p_party_id: party.id, p_invitee_id: userId });
      if (error) {
        toast(error.code === '23505' ? '이미 초대했거나 파티원인 회원입니다.' : error.message);
        await searchPartyInviteCandidates();
        return;
      }
      if (state.currentParty === party) {
        candidate.invite_status = 'pending';
        renderPartyInviteResults();
      }
      toast('초대를 보냈습니다.');
    } catch (error) {
      toast(error.message || '초대 발송에 실패했습니다.');
      button.disabled = false;
    }
  }

function renderPartyJoined() {
  const party = state.currentParty;
  const intervalSec = sanitizePartyGpsInterval(party?.gps_interval_seconds);
  const members = Array.isArray(party?.members) ? party.members : [];
  for (const member of members) {
    if (member && typeof member === 'object') {
      member.gpsStatus = computePartyMemberGpsStatus(member, intervalSec);
    }
  }
  const courses = resolvePartySharedCourses(party);
  if (party) {
    party.sharedCourses = courses;
  }
  const activeRouteId = party?.active_route_id || courses.find(course => course?.isActive)?.id || '';
  const activeCourse = courses.find(course => course?.id === activeRouteId) || null;
  $('#partyJoinedName').textContent = typeof party?.name === 'string' && party.name.trim() ? party.name : '파티 정보가 없습니다';
  $('#partyJoinedCount').textContent = Array.isArray(party?.members) ? `현재 ${members.length}명 참가 중` : '파티 인원 정보 없음';
  $('#partyJoinedCourseCount').textContent = party ? `${courses.length}개` : '—';
  const activeNameEl = $('#partyJoinedActiveCourseName');
  const activeDistEl = $('#partyJoinedActiveCourseDistance');
  if (activeNameEl) {
    activeNameEl.textContent = typeof activeCourse?.name === 'string' && activeCourse.name.trim()
      ? activeCourse.name
      : '활성 코스가 없습니다';
  }
  if (activeDistEl) {
    activeDistEl.textContent = Number.isFinite(activeCourse?.km) ? `${activeCourse.km.toFixed(1)} km` : '';
  }
  $('#partyJoinedCourses').innerHTML = courses.length ? courses.map(course => {
    const isActive = course?.id === activeRouteId || Boolean(course?.isActive && !activeRouteId);
    const activeBadge = isActive ? '<span class="party-joined-course-badge">ACTIVE</span>' : '';
    const dist = Number.isFinite(course?.km) ? `<small>${course.km.toFixed(1)} km</small>` : '';
    const courseIdAttr = escapeHtml(course?.id || '');
    return `<div class="party-joined-course${isActive ? ' active' : ''}"><div class="party-joined-course-main"><div class="party-joined-course-title"><strong>${escapeHtml(course?.name || '이름 없는 코스')}</strong>${activeBadge}</div>${dist}</div><button type="button" class="party-joined-preview-btn" data-party-preview-id="${courseIdAttr}"><span class="material-symbols-outlined" aria-hidden="true">map</span><span>미리보기</span></button></div>`;
  }).join('') : '<p>공유 코스가 없습니다.</p>';

  const joinedLocToggle = $('#partyJoinedLocationToggle');
  if (joinedLocToggle) {
    joinedLocToggle.setAttribute('aria-checked', String(isMyPartyLocationSharingEnabled(party)));
    joinedLocToggle.disabled = !party?.id;
  }
  const joinedLocSubtext = $('#partyJoinedLocationSubtext');
  if (joinedLocSubtext) {
    joinedLocSubtext.textContent = formatMyLocationSubtext(party);
  }

  $('#partyJoinedMemberCount').textContent = Array.isArray(party?.members) ? `${members.length}명` : '—';
  const online = members.filter(member => member?.gpsStatus === 'online').length;
  const offCount = members.filter(member => member?.gpsStatus === 'off').length;
  const offline = Math.max(0, members.length - online - offCount);
  $('#partyJoinedGpsStatus').textContent = members.length
    ? `온라인 ${online}명 · 대기/오프라인 ${offline}명${offCount ? ` · 공유 꺼짐 ${offCount}명` : ''}`
    : 'GPS 상태 정보가 없습니다.';
  $('#partyJoinedMembers').innerHTML = members.length
    ? members.map(member => renderPartyMemberRowHtml(member, true)).join('')
    : '<p>표시할 파티원이 없습니다.</p>';
}

async function startPartyMemberRideOn() {
  const party = state.currentParty;
  const button = $('#partyJoinedRideOnBtn');
  if (!party?.id || !button || button.disabled || !supabaseClient || !state.session?.user || state.profile?.status !== 'approved') return;
  const client = supabaseClient;
  const userId = state.session.user.id;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const { data, error } = await client.rpc('list_my_party_routes');
    if (client !== supabaseClient || state.session?.user?.id !== userId || state.currentParty !== party) return;
    if (error) throw error;
    const partyRows = (data || []).filter(row => row.party_id === party.id);
    const activeRow = partyRows.find(row => row.is_active);
    const activeCourse = normalizePartyRouteRow(activeRow);
    if (!activeCourse) {
      toast('현재 활성화된 파티 코스가 없습니다.');
      return;
    }
    party.partyRoutes = partyRows.map(normalizePartyRouteRow).filter(Boolean);
    party.route_ids = partyRows
      .slice()
      .sort((a, b) => Number(a.route_order) - Number(b.route_order))
      .map(row => row.route_id)
      .filter(Boolean);
    party.sharedCourses = resolvePartySharedCourses(party);
    party.active_route_id = activeCourse.id;
    party.sharedCourse = activeCourse;
    renderPartyJoined();
    const srcRegion = $('#region');
    if (activeCourse.region && srcRegion && srcRegion.value !== activeCourse.region && regions[activeCourse.region]) {
      srcRegion.value = activeCourse.region;
      srcRegion.dispatchEvent(new Event('change'));
    }
    applySavedRoute(activeCourse, 'ride');
    syncPartyGpsRuntimeForCurrentParty();
    refreshCurrentPartyMemberLocations();
  } catch (error) {
    toast(error?.message || '파티 활성 코스를 불러오지 못했습니다.');
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
}

  async function loadReceivedPartyInvites() {
    state.receivedPartyInvites = [];
    state.partyInvitesReady = false;
    renderPartyReceivedInvites();
    if (!supabaseClient || !state.session?.user || state.profile?.status !== 'approved') return false;
    const client = supabaseClient;
    const userId = state.session.user.id;
    try {
      const { data, error } = await client.rpc('list_received_party_invitations');
      if (client !== supabaseClient || state.session?.user?.id !== userId) return false;
      if (error) {
        if (!['PGRST202', '42883'].includes(error.code)) console.warn('Received party invitations:', error);
        return false;
      }
      state.receivedPartyInvites = (data || []).map(item => ({
        id: item.id, partyId: item.party_id, partyName: item.party_name,
        leaderName: item.leader_name, status: item.status, createdAt: item.created_at
      }));
      state.partyInvitesReady = true;
      renderPartyReceivedInvites();
      return true;
    } catch (error) {
      console.warn('Received party invitations:', error);
      return false;
    }
  }

  async function respondPartyInvite(invitationId, decision, button) {
    if (!supabaseClient || !state.session?.user || state.profile?.status !== 'approved') return;
    const invitation = state.receivedPartyInvites?.find(item => item.id === invitationId && item.status === 'pending');
    if (!invitation) return;
    const client = supabaseClient;
    const userId = state.session.user.id;
    const buttons = button.closest('.party-received-actions').querySelectorAll('button');
    buttons.forEach(item => { item.disabled = true; });
    try {
      const { error } = await client.rpc('respond_party_invitation', {
        p_invitation_id: invitationId, p_decision: decision
      });
      if (client !== supabaseClient || state.session?.user?.id !== userId) return;
      if (error) throw error;
      toast(decision === 'accepted' ? '초대를 수락했습니다.' : '초대를 거절했습니다.');
      if (decision === 'accepted') await loadMyParties({ selectedId: invitation.partyId });
      if (!await loadReceivedPartyInvites()) toast('초대 목록을 갱신하지 못했습니다.');
    } catch (error) {
      toast(error.message || '초대 처리에 실패했습니다.');
    } finally {
      buttons.forEach(item => { item.disabled = false; });
    }
  }

  function renderPartyReceivedInvites() {
    const invitations = Array.isArray(state.receivedPartyInvites) ? state.receivedPartyInvites.filter(Boolean) : [];
    const pending = invitations.filter(item => ['pending', 'invited', 'received'].includes(String(item.status || '').toLowerCase()));
    const history = invitations.filter(item => ['accepted', 'declined', 'rejected', 'expired'].includes(String(item.status || '').toLowerCase()));
    const mainStatus = $('#partyMainInviteStatus');
    if (mainStatus) mainStatus.textContent = !state.session?.user ? '로그인 후 초대 내역을 확인할 수 있습니다.'
      : !state.partyInvitesReady ? '초대 내역은 연결 후 표시됩니다.'
        : pending.length ? `대기 중인 초대 ${pending.length}건` : '대기 중인 초대가 없습니다.';
    $('#partyReceivedPendingCount').textContent = `${pending.length}건`;
    $('#partyReceivedPendingList').innerHTML = pending.length ? pending.map(item => {
      const partyName = escapeHtml(item.partyName || item.party?.name || '파티명 없음');
      const leader = item.leaderName ? `<span><span class="material-symbols-outlined" aria-hidden="true">account_circle</span>${escapeHtml(item.leaderName)}</span>` : '';
      const count = Number.isFinite(item.memberCount) ? `<span><span class="material-symbols-outlined" aria-hidden="true">groups</span>현재 ${item.memberCount}명 참가 중</span>` : '';
      return `<article class="party-received-card"><h3>${partyName}</h3><div class="party-received-meta">${leader}${count}</div><span class="party-received-status">초대 대기중</span><div class="party-received-actions"><button type="button" data-invitation-id="${escapeHtml(item.id)}" data-invitation-decision="declined"><span class="material-symbols-outlined" aria-hidden="true">close</span>거절</button><button type="button" data-invitation-id="${escapeHtml(item.id)}" data-invitation-decision="accepted"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>수락</button></div></article>`;
    }).join('') : '<div class="party-received-empty"><span class="material-symbols-outlined" aria-hidden="true">mail</span><p>대기 중인 초대가 없습니다.</p></div>';
    $('#partyReceivedHistoryList').innerHTML = history.length ? history.map(item => {
      const status = String(item.status).toLowerCase();
      const label = status === 'accepted' ? '수락됨' : status === 'expired' ? '만료됨' : '거절됨';
      return `<article class="party-received-card party-received-past"><h3>${escapeHtml(item.partyName || item.party?.name || '파티명 없음')}</h3><span class="party-received-status">${label}</span></article>`;
    }).join('') : '<div class="party-received-empty"><p>지난 초대 기록이 없습니다.</p></div>';
  }

  function initMobileStandaloneInteractions() {
    // Routes screen buttons
    $('#mobileRoutesBackBtn')?.addEventListener('click', () => setMobileAppView('map'));
    $('#mobilePartyBackBtn')?.addEventListener('click', () => setMobileAppView('map'));
    $('#mobileAccountBackToMapBtn')?.addEventListener('click', () => setMobileAppView('map'));

    const partyRegion = $('#partyCreateRegion');
    const partyCourseScreen = $('#mobilePartyCreateScreen');
    const partyCourseModal = $('#partyCreateCourseModal');
    const partyCourseList = $('#partyCreateCourseList');
    const partyCourseOpen = $('#partyCreateCourseOpenBtn');
    const partyCourseReset = $('#partyCreateCourseResetBtn');
    if (partyRegion) {
      partyRegion.innerHTML = Object.entries(regions)
        .filter(([, details]) => !details.custom)
        .map(([id, details]) => `<option value="${escapeHtml(id)}">${escapeHtml(details.label)}</option>`).join('');
      partyRegion.value = [...partyRegion.options].some(option => option.value === $('#region').value) ? $('#region').value : partyRegion.options[0]?.value || '';
      partyRegion.addEventListener('change', () => {
        partyCourseScreen.dataset.selectedCourses = '[]';
        renderPartyCreateCourses();
      });
    }
    let partyCourseReturnFocus = partyCourseOpen;
    function closePartyCourseModal() {
      partyCourseModal.hidden = true;
      (partyCourseReturnFocus.hidden ? partyCourseOpen : partyCourseReturnFocus).focus();
    }
    function openPartyCourseModal(resetSelection, trigger) {
      renderPartyCreateCourses();
      partyCourseReturnFocus = trigger;
      if (resetSelection) partyCourseList.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
      partyCourseModal.hidden = false;
      (partyCourseList.querySelector('input') || $('#partyCreateCourseConfirmBtn')).focus();
    }
    partyCourseOpen?.addEventListener('click', () => openPartyCourseModal(false, partyCourseOpen));
    partyCourseReset?.addEventListener('click', () => openPartyCourseModal(true, partyCourseReset));
    $('#partyCreateCourseCloseBtn')?.addEventListener('click', closePartyCourseModal);
    partyCourseModal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePartyCourseModal();
    });
    $('#partyCreateCourseConfirmBtn')?.addEventListener('click', () => {
      partyCourseScreen.dataset.selectedCourses = JSON.stringify([...partyCourseList.querySelectorAll('input:checked')].map(input => Number(input.value)));
      renderPartyCreateCourses();
      closePartyCourseModal();
    });
    $('#partyOpenCreateBtn')?.addEventListener('click', () => setMobileAppView('party-create'));
    $('#partyMainEntries')?.addEventListener('click', event => {
      const id = event.target.closest('[data-party-id]')?.dataset.partyId;
      const party = state.myParties.find(item => item.id === id);
      if (!party) return;
      selectMyParty(party);
      renderPartyMain();
      setMobileAppView(state.currentParty.isLeader ? 'party-leader' : 'party-joined');
    });
    $('#partyCreateBackBtn')?.addEventListener('click', () => setMobileAppView('party'));
    const partyCount = $('#partyCreateMemberCount');
    for (const [id, delta] of [['partyCreateDecreaseBtn', -1], ['partyCreateIncreaseBtn', 1]]) {
      $(`#${id}`)?.addEventListener('click', () => {
        const count = Math.max(2, Math.min(30, Number.parseInt(partyCount.textContent, 10) + delta));
        partyCount.textContent = `${count}명`;
      });
    }
    const locationToggle = $('#partyCreateLocationToggle');
    locationToggle?.addEventListener('click', () => {
      const enabled = locationToggle.getAttribute('aria-checked') !== 'true';
      locationToggle.setAttribute('aria-checked', String(enabled));
    });
    $('#partyCreateSubmitBtn')?.addEventListener('click', async () => {
      if (!state.partySchemaReady || state.profile?.status !== 'approved' || !supabaseClient || !state.session?.user) return;
      const name = $('#partyCreateName').value.trim();
      const region = partyRegion.value;
      const code = `INV-${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').toUpperCase()}`.slice(0, 32);
      const maxMembers = Number.parseInt(partyCount.textContent, 10);
      const selected = JSON.parse(partyCourseScreen.dataset.selectedCourses || '[]');
      const routes = selected.map(index => state.saved[index]);
      if (!name || name.length > 100) { toast('파티명을 1~100자로 입력하세요.'); return; }
      if (!regions[region] || regions[region].custom) { toast('지역을 선택하세요.'); return; }
      if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 30) { toast('정원은 2~30명이어야 합니다.'); return; }
      if (routes.some(route => !route?.id || route.source !== 'cloud' || route.region !== region)) { toast('저장된 내 코스만 선택할 수 있습니다.'); return; }
      const button = $('#partyCreateSubmitBtn');
      button.disabled = true;
      const client = supabaseClient;
      try {
        const { data, error } = await client.rpc('create_party', {
          p_name: name, p_region: region, p_route_ids: routes.map(route => route.id),
          p_max_members: maxMembers, p_invite_code: code,
          p_location_sharing_enabled: locationToggle.getAttribute('aria-checked') === 'true'
        });
        if (error) {
          if (error.code === 'PGRST202') state.partySchemaReady = false;
          toast(error.code === '23505' ? '이미 사용 중인 초대 코드입니다.' : error.message);
          return;
        }
        await loadMyParties({selectedId:data});
        if (state.currentParty?.id === data) setMobileAppView('party-leader');
        else toast('파티를 만들었지만 목록을 불러오지 못했습니다.');
      } catch (error) {
        toast(error.message || '파티 생성에 실패했습니다.');
      } finally {
        setPartyCreateAvailability();
      }
    });
  $('#partyCreateCancelBtn')?.addEventListener('click', () => {
    $('#partyCreateName').value = '';
    partyCourseScreen.dataset.selectedCourses = '[]';
    partyRegion.value = [...partyRegion.options].some(option => option.value === $('#region').value) ? $('#region').value : partyRegion.options[0]?.value || '';
    renderPartyCreateCourses();
    partyCount.textContent = '8명';
    locationToggle.setAttribute('aria-checked', 'true');
    $('#mobilePartyCreateScreen').scrollTop = 0;
    setMobileAppView('party');
  });
  $('#partyOpenReceivedBtn')?.addEventListener('click', () => setMobileAppView('party-received'));
  $('#partyReceivedBackBtn')?.addEventListener('click', () => setMobileAppView('party'));
  $('#partyReceivedPendingList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-invitation-id]');
    if (button && !button.disabled) respondPartyInvite(button.dataset.invitationId, button.dataset.invitationDecision, button);
  });
  $('#partyJoinedBackBtn')?.addEventListener('click', () => setMobileAppView('party'));
  $('#partyJoinedRideOnBtn')?.addEventListener('click', startPartyMemberRideOn);
  $('#partyJoinedLocationToggle')?.addEventListener('click', event => {
    const toggle = event.currentTarget;
    if (toggle.disabled) return;
    const nextEnabled = toggle.getAttribute('aria-checked') !== 'true';
    toggleMyPartyLocationSharing(nextEnabled);
  });
  $('#partyLeaderLocationToggle')?.addEventListener('click', event => {
    const toggle = event.currentTarget;
    if (toggle.disabled) return;
    const nextEnabled = toggle.getAttribute('aria-checked') !== 'true';
    toggleMyPartyLocationSharing(nextEnabled);
  });
  $('#partyLeaderGpsIntervalGroup')?.addEventListener('click', event => {
    const button = event.target.closest('[data-gps-interval]');
    if (!button || button.disabled) return;
    setPartyLeaderGpsInterval(Number(button.dataset.gpsInterval));
  });
  $('#partyJoinedLeaveBtn')?.addEventListener('click', () => { $('#partyJoinedLeaveModal').hidden = false; });
  $('#partyJoinedLeaveCloseBtn')?.addEventListener('click', () => { $('#partyJoinedLeaveModal').hidden = true; });
  $('#partyJoinedLeaveConfirmBtn')?.addEventListener('click', leaveCurrentParty);
  $('#partyJoinedLeaveModal')?.addEventListener('keydown', event => {
    if (event.key === 'Escape') $('#partyJoinedLeaveModal').hidden = true;
  });
  $('#partyLeaderBackBtn')?.addEventListener('click', () => setMobileAppView('party'));
  $('#partyLeaderInviteBtn')?.addEventListener('click', () => setMobileAppView('party-invite'));
  $('#partyInviteBackBtn')?.addEventListener('click', () => setMobileAppView('party-leader'));
  $('#partyInviteSearchInput')?.addEventListener('input', () => {
    if (state.currentParty) state.currentParty.inviteCandidates = [];
    renderPartyInviteResults();
  });
  $('#partyInviteSearchBtn')?.addEventListener('click', searchPartyInviteCandidates);
  $('#partyInviteSearchInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') searchPartyInviteCandidates();
  });
  $('#partyInviteResults')?.addEventListener('click', event => {
    const button = event.target.closest('[data-invite-user-id]');
    if (button && !button.disabled) sendPartyInvite(button.dataset.inviteUserId, button);
  });
  $('#partyLeaderDisbandBtn')?.addEventListener('click', () => { $('#partyLeaderDisbandModal').hidden = false; });
  $('#partyLeaderDisbandCloseBtn')?.addEventListener('click', () => { $('#partyLeaderDisbandModal').hidden = true; });
  $('#partyLeaderDisbandConfirmBtn')?.addEventListener('click', disbandCurrentParty);
  $('#partyLeaderDisbandModal')?.addEventListener('keydown', event => {
    if (event.key === 'Escape') $('#partyLeaderDisbandModal').hidden = true;
  });
  $('#partyLeaderCourseList')?.addEventListener('click', event => {
    const previewBtn = event.target.closest('[data-party-preview-id]');
    if (previewBtn && !previewBtn.disabled) {
      previewPartyCourse(previewBtn.dataset.partyPreviewId);
      return;
    }
    const removeBtn = event.target.closest('[data-party-remove-id]');
    if (removeBtn && !removeBtn.disabled) {
      removePartyLeaderCourse(removeBtn.dataset.partyRemoveId);
      return;
    }
    const button = event.target.closest('[data-party-course-id]');
    if (!button || button.disabled || !state.currentParty) return;
    const courseId = button.dataset.partyCourseId;
    if (!courseId) return;
    state.currentParty.selectedRouteId = courseId;
    state.currentParty.courseError = '';
    renderPartyLeader();
  });
  $('#partyLeaderAddCourseBtn')?.addEventListener('click', addPartyLeaderCourse);
  $('#partyLeaderSetActiveBtn')?.addEventListener('click', savePartyLeaderActiveCourse);
  $('#partyLeaderRideOnBtn')?.addEventListener('click', startPartyLeaderRideOn);
  $('#partyJoinedCourses')?.addEventListener('click', event => {
    const previewBtn = event.target.closest('[data-party-preview-id]');
    if (previewBtn && !previewBtn.disabled) {
      previewPartyCourse(previewBtn.dataset.partyPreviewId);
    }
  });

    renderMobileCourseRegions();
    $('#mobileRoutesRegion')?.addEventListener('change', e => setMobileCourseRegion(e.target.value));
    $('#mobileEditorRegion')?.addEventListener('change', e => setMobileCourseRegion(e.target.value));
    $('#mobileEditorAddRegionBtn')?.addEventListener('click', () => {
      const label = window.prompt('현재 지도 중심을 새 지역으로 저장합니다. 지역 이름을 입력하세요')?.trim();
      if (!label) return;
      const center = map.getCenter();
      const custom = { id: 'course-region-' + Date.now(), label: label.slice(0, 40), center: [center.lng, center.lat] };
      mobileCustomCourseRegions.push(custom);
      localStorage.setItem('powderline.courseRegions', JSON.stringify(mobileCustomCourseRegions));
      renderMobileCourseRegions();
      setMobileCourseRegion(custom.id);
    });
    $('#mobileRoutesCourseSelect')?.addEventListener('change', e => {
      mobileSelectedSavedIndex = e.target.value;
      if (e.target.value === '') {
        state.points = [];
        state.selectedVertex = null;
        const cur = getActiveCourse();
        if (cur) { cur.points = []; cur.isDirty = false; }
        renderCourseWorkList();
        render();
        syncMobileRoutesActions();
        return;
      }
      const item = state.saved[Number(e.target.value)];
      if (!item) return;
      state.editorMode = false;
      state.selectedVertex = null;
      state.points = item.points.map(p => ({ ...p }));
      const cur = getActiveCourse();
      if (cur) {
        cur.name = item.name;
        cur.points = [...state.points];
        cur.saved = true;
        cur.isDirty = false;
        cur.databaseId = item.source === 'cloud' ? item.id : null;
        $('#courseName').value = cur.name;
        const mInput = $('#mobileEditorCourseName');
        if (mInput) mInput.value = cur.name;
      }
      const rideName = $('#rideCourseName');
      if (rideName) rideName.textContent = item.name;
      const mobileCourseNameEl = $('#mobileCourseNameDisplay');
      if (mobileCourseNameEl) mobileCourseNameEl.textContent = item.name;
      mobileEditingSavedRoute = item.source !== 'cloud' ? item : null;
      renderCourseWorkList();
      render();
      if (state.points.length) {
        const bounds = state.points.reduce((box, p) => box.extend([p.lng, p.lat]), new mapboxgl.LngLatBounds([state.points[0].lng, state.points[0].lat], [state.points[0].lng, state.points[0].lat]));
        map.fitBounds(bounds, { padding: 90, duration: 900, maxZoom: 13 });
      }
      toast(t('toastLoadedSaved'));
      syncMobileRoutesActions();
      if (typeof setMobileAppView === 'function') {
        setMobileAppView('routes');
      }
    });
    $('#mobileRoutesEditBtn')?.addEventListener('click', () => {
      const selectedVal = $('#mobileRoutesCourseSelect')?.value;
      if (selectedVal === '' || selectedVal === undefined || selectedVal === null) {
        toast(state.lang === 'ko' ? '수정할 코스를 먼저 선택하세요.' : 'Please select a course to edit.');
        return;
      }
      const item = state.saved[Number(selectedVal)];
      if (!item) {
        toast(state.lang === 'ko' ? '수정할 코스를 먼저 선택하세요.' : 'Please select a course to edit.');
        return;
      }
      pushHistory();
      mobileEditingSavedRoute = item.source !== 'cloud' ? item : null;
      openCourseEditor();
      const cur = getActiveCourse();
      if (cur) {
        cur.saved = true;
        cur.isDirty = false;
        $('#courseName').value = cur.name;
        const mInput = $('#mobileEditorCourseName');
        if (mInput) mInput.value = cur.name;
      }
      const regInput = $('#mobileEditorRegion');
      if (regInput) regInput.value = item.region || $('#region').value;
      updateUndoRedoUI();
    });
    $('#mobileRoutesNewBtn')?.addEventListener('click', () => {
      mobileEditingSavedRoute = null;
      mobileSelectedSavedIndex = '';
      const courseSelect = $('#mobileRoutesCourseSelect');
      if (courseSelect) courseSelect.value = '';
      const hadCourses = state.courses.length > 0;
      openCourseEditor();
      if (hadCourses) {
        const id = 'course-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const name = t('routeDefaultName', regions[$('#region').value].label, new Date().toLocaleDateString('ko-KR'));
        state.courses.push({ id, name, points: [], saved: false });
        state.selectedCourseId = id;
        $('#courseName').value = name;
        $('#mobileEditorCourseName').value = name;
      } else {
        getActiveCourse().points = [];
      }
      state.points = [];
      render();
    });
    $('#mobileRoutesExportGpxBtn')?.addEventListener('click', () => {
      $('#exportBtn')?.click();
    });
    $('#mobileRoutesDeleteBtn')?.addEventListener('click', async () => {
      const selectedVal = $('#mobileRoutesCourseSelect')?.value;
      if (selectedVal === '' || selectedVal === undefined || selectedVal === null) {
        toast(state.lang === 'ko' ? '삭제할 코스를 먼저 선택하세요.' : 'Please select a course to delete.');
        return;
      }
      const idx = Number(selectedVal);
      const item = state.saved[idx];
      if (!item) {
        toast(state.lang === 'ko' ? '삭제할 코스를 먼저 선택하세요.' : 'Please select a course to delete.');
        return;
      }
      const confirmMsg = state.lang === 'ko' ? `"${item.name}" 코스를 삭제하시겠습니까?` : `Delete course "${item.name}"?`;
      if (!window.confirm(confirmMsg)) return;

      if (item.source === 'cloud' && item.id && supabaseClient && state.session?.user) {
        try {
          const { error } = await supabaseClient.from('powderline_routes').delete().eq('id', item.id);
          if (error) {
            toast(error.message);
            return;
          }
        } catch (e) {
          console.error(e);
        }
      }

      state.saved.splice(idx, 1);
      localStorage.setItem('powderline.routes', JSON.stringify(state.saved.filter(r => r.source !== 'cloud')));

      state.points = [];
      state.selectedVertex = null;
      const cur = getActiveCourse();
      if (cur) {
        cur.points = [];
        cur.saved = false;
        cur.isDirty = false;
      }
      mobileSelectedSavedIndex = '';
      const sel = $('#mobileRoutesCourseSelect');
      if (sel) sel.value = '';

      renderSaved();
      renderMobileSavedRoutes();
      renderCourseWorkList();
      render();

      toast(state.lang === 'ko' ? '코스가 삭제되었습니다.' : 'Course deleted.');
    });
    $('#mobileEditorImportGpxBtn')?.addEventListener('click', () => $('#gpxInput')?.click());
    $('#mobileEditorExportGpxBtn')?.addEventListener('click', () => $('#exportBtn')?.click());
    $('#mobileRoutesCompassBtn')?.addEventListener('click', () => map.easeTo({ bearing: 0, pitch: 0, duration: 600 }));
    $('#mobileRoutesZoomInBtn')?.addEventListener('click', () => map.zoomIn({ duration: 300 }));
    $('#mobileRoutesZoomOutBtn')?.addEventListener('click', () => map.zoomOut({ duration: 300 }));
    $('#mobileRoutesStyleBtn')?.addEventListener('click', () => $('#mobileStyleBtn')?.click());
    $('#mobileRoutesLocateBtn')?.addEventListener('click', () => triggerMyLocationGps({ center: true }));
    $('#mobileEditorCompassBtn')?.addEventListener('click', () => map.easeTo({ bearing: 0, pitch: 0, duration: 600 }));
    $('#mobileEditorZoomInBtn')?.addEventListener('click', () => map.zoomIn({ duration: 300 }));
    $('#mobileEditorZoomOutBtn')?.addEventListener('click', () => map.zoomOut({ duration: 300 }));
    $('#mobileEditorStyleBtn')?.addEventListener('click', () => $('#mobileStyleBtn')?.click());
    $('#mobileEditorLocateBtn')?.addEventListener('click', () => triggerMyLocationGps({ center: true }));

    // Course Editor HUD tools
    const toolBtns = [
      { id: '#mobileToolDraw', tool: 'draw' },
      { id: '#mobileToolEdit', tool: 'edit' },
      { id: '#mobileToolCut', tool: 'cut' },
      { id: '#mobileToolDeleteSegment', tool: 'delete-segment' }
    ];
    toolBtns.forEach(({ id, tool }) => {
      $(id)?.addEventListener('click', () => {
        mobileRoutePointsHidden = false;
        setEditorTool(tool);
        render();
        toast($('#editorStatus').textContent);
      });
    });
    $('#mobileEditorWorkingCourseSelect')?.addEventListener('change', e => {
      const item = [...$('#courseWorkList').querySelectorAll('.course-item')].find(button => button.dataset.id === e.target.value);
      item?.click();
    });

    // Course Editor inputs & actions
    const mCourseName = $('#mobileEditorCourseName');
    if (mCourseName) {
      mCourseName.addEventListener('focus', () => { mCourseName.dataset.historyRecorded = 'false'; });
      mCourseName.addEventListener('blur', () => { mCourseName.dataset.historyRecorded = 'false'; });
      mCourseName.addEventListener('input', e => {
        const cur = getActiveCourse();
        if (cur && cur.name !== e.target.value) {
          if (e.target.dataset.historyRecorded !== 'true') { pushHistory(); e.target.dataset.historyRecorded = 'true'; }
          cur.name = e.target.value;
          cur.isDirty = true;
          $('#courseName').value = e.target.value;
          renderCourseWorkList();
        }
      });
    }

    $('#mobileEditorUndoBtn')?.addEventListener('click', undo);
    for (const [toggleId, bodyId] of [['#mobileRoutesProfileToggle', '#mobileRoutesProfileBody'], ['#mobileEditorProfileToggle', '#mobileEditorProfileBody']]) {
      $(toggleId)?.addEventListener('click', e => {
        const body = $(bodyId);
        body.hidden = !body.hidden;
        e.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
        if (!body.hidden) requestAnimationFrame(renderMobileCourseProfiles);
      });
    }
    $('#mobileEditorDetailToggle')?.addEventListener('click', e => {
      const body = $('#mobileEditorDetailBody');
      body.hidden = !body.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
    });
    $('#mobileEditorSaveBtn')?.addEventListener('click', async () => {
      if (await saveActiveCourse()) {
        mobileSelectedSavedIndex = '';
        closeCourseEditor(false);
      }
    });
    $('#mobileEditorCancelBtn')?.addEventListener('click', requestCloseCourseEditor);
    $('#mobileEditorDeleteBtn')?.addEventListener('click', deleteActiveCourse);
    $('#mobileEditorCloseBtn')?.addEventListener('click', () => {
      requestCloseCourseEditor();
    });

    renderMobileSavedRoutes();
  }


  function showSplitHUD() {
    const hud = $('#courseSplitHUD');
    if (!hud) return;
    hud.hidden = false;
    const statusEl = $('#editorStatus');
    if (statusEl) statusEl.textContent = state.lang === 'ko' ? '✂ 구간 분할됨: 삭제할 구간을 선택하세요.' : '✂ Split active: select a segment to delete.';
  }

  function closeSplitHUD() {
    const hud = $('#courseSplitHUD');
    if (hud) hud.hidden = true;
    splitState = null;
    const statusEl = $('#editorStatus');
    if (statusEl && state.tool === 'cut') statusEl.textContent = t('statusCutTip');
  }

  function deletePartA() {
    if (!splitState) return;
    pushHistory();
    state.points = [...splitState.partB];
    state.selectedVertex = null;
    closeSplitHUD();
    syncActiveCoursePoints();
    renderCourseWorkList();
    render();
    toast(state.lang === 'ko' ? '구간 A를 삭제했습니다. (구간 B 유지)' : 'Deleted Segment A (Segment B retained).');
  }

  function deletePartB() {
    if (!splitState) return;
    pushHistory();
    state.points = [...splitState.partA];
    state.selectedVertex = null;
    closeSplitHUD();
    syncActiveCoursePoints();
    renderCourseWorkList();
    render();
    toast(state.lang === 'ko' ? '구간 B를 삭제했습니다. (구간 A 유지)' : 'Deleted Segment B (Segment A retained).');
  }

  function cancelSplit() {
    if (!splitState) return;
    closeSplitHUD();
    render();
    toast(state.lang === 'ko' ? '구간 나누기를 취소했습니다.' : 'Cancelled route split.');
  }

  function initSplitHUDInteractions() {
    $('#splitDeleteABtn')?.addEventListener('click', deletePartA);
    $('#splitDeleteBBtn')?.addEventListener('click', deletePartB);
    $('#splitCancelBtn')?.addEventListener('click', cancelSplit);
  }

  initSplitHUDInteractions();
  initStitchAccountInteractions();
  initMobileHomeInteractions();
  initMobileStandaloneInteractions();

  initializeSupabase();
})();
