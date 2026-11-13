; (async () => {
  const regions = {
    asahidake: { label: '아사히다케', center: [142.854, 43.663], zoom: 11.0, bearing: 12, pitch: 54 },
    rusutsu: { label: '루스츠', center: [140.88, 42.74], zoom: 11.0, bearing: -18, pitch: 54 },
    furano: { label: '후라노', center: [142.355, 43.325], zoom: 11.0, bearing: 16, pitch: 54 },
    niseko: { label: '니세코', center: [140.69, 42.86], zoom: 10.5, bearing: -20, pitch: 54 },
    kamui: { label: '카무이 스키 링크스', center: [142.19, 43.70], zoom: 11.0, bearing: 8, pitch: 54 },
    kiroro: { label: '키로로', center: [140.99, 43.07], zoom: 10.8, bearing: -12, pitch: 54 }
  };
  const builtInRegionIds = new Set(['asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro']);
  let catalogRegionIds = new Set();
  let adminRegionRows = [];
  let adminRegionsForbiddenForUser = null;
  let adminRegionPicker = null;
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
      toolEditPc: '포인트 추가',
      btnCreateCoursePc: '코스 생성 & 편집',
      btnSatellitePc: '위성지도',
      btnTopoPc: '지형도',
      toolCut: '✂ 코스 자르기',
      toolDeleteSegment: '구간 삭제',
      btnUndo: '실행 취소',
      btnRedo: '다시 실행',
      btnDeleteVertex: '선택 꼭짓점 삭제',
      btnDeleteVertexPc: '선택 포인트 삭제',
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
      statusEditTipPc: '경로선을 클릭하면 그 위치에 포인트가 추가됩니다. 포인트는 드래그로 이동, 더블클릭으로 삭제합니다.',
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
      toolEditPc: 'Add Point',
      btnCreateCoursePc: 'Create & Edit Course',
      btnSatellitePc: 'Satellite',
      btnTopoPc: 'Topo',
      toolCut: '✂ Cut Course',
      toolDeleteSegment: 'Delete Segment',
      btnUndo: 'Undo',
      btnRedo: 'Redo',
      btnDeleteVertex: 'Delete Vertex',
      btnDeleteVertexPc: 'Delete Selected Point',
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
      statusEditTipPc: 'Click the route line to add a point there. Drag points to move, double-click to delete.',
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
  const state = { offlineCatalog: { phase: 'idle', message: '' }, nativeMap: { active: false, session: false, shown: false, regionId: '', unavailable: '', route: null, gpsLine: null, routeTimer: null, eventsBound: false, timer: null, observer: null }, viewStack: [], backNavigating: false, lang: localStorage.getItem('powderline.lang') || 'ko', selectedLiftId: null, points: [], courses: [], selectedCourseId: null, editorMode: false, tool: 'navigate', selectedVertex: null, segmentStart: null, mapStyle: 'satellite', saved: localSavedRoutes, session: null, profile: null, pendingUsers: [], pendingUsersError: null, myParties: [], currentParty: null, partySchemaReady: false };
  let pcRegionModalKey = null; // PC region course modal; declared here because renderSaved runs during startup
  let mobileEditingSavedRoute = null;
  let mobileRoutePointsHidden = false;
  let mobileSelectedSavedIndex = '';
  let mobileHomeMapMode = 'online';
  let offlineMapTestPlugin = null;
  let offlineRegionStatusRequest = 0;
  let offlineRegionOpenInProgress = false;
  let mobileHomeCatalogRefreshPromise = null;
  const offlineRegionStatuses = new Map();
  const offlineRegionDownloads = new Set(); // the one region Native is downloading right now (at most 1)
  const offlineDownloadQueue = []; // FIFO of region ids waiting for their turn
  const offlineRegionOutcome = new Map(); // id -> { state: 'failed' | 'cancelled', message } for the last attempt
  const offlineRegionProgress = new Map();
  let offlineActiveJob = null; // { id, jobId, lastChangeAt, sig, cancelRequested }
  let offlineStallTimer = null;
  const OFFLINE_STALL_MS = 60000;
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
  let accountPasswordReauthUserId = null;
  let authInitializationComplete = false;
  let onlineAuthVerified = false;
  let offlineAccessActive = false;
  let offlineRevalidationTimer = null;
  let offlineRevalidationRunning = false;
  let authConnectivityListenersRegistered = false;
  let introPlaybackComplete = false;
  let mobileAuthActiveView = 'login';
  let setMobileAppView = () => { };
  const MAPBOX_TOKEN_KEY = 'powderline.mapboxCompareToken';
  const MAPBOX_TOKEN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mapbox-public-token`;
  const MAPBOX_STYLES = { satellite: 'mapbox://styles/mapbox/standard-satellite', topo: 'mapbox://styles/mapbox/outdoors-v12' };

  const SUPABASE_AUTH_STORAGE = 'powderline.supabase.auth';
  const OFFLINE_ACCESS_STORAGE = 'powderline.offlineAccess.v1';
  const LEGACY_PROFILE_CACHE_PREFIX = 'powderline.profile.';
  const INITIAL_AUTH_TIMEOUT_MS = 8000;
  const GPS_RECORDING_STORAGE_PREFIX = 'powderline.gpsRecording.v1.';
  const GPS_PENDING_ROUTES_PREFIX = 'powderline.gpsPendingRoutes.v1.';
  const GPS_MAX_ACCURACY_METERS = 35;            // normal acceptance
  const GPS_FALLBACK_ACCURACY_METERS = 60;       // 35-60 m: only to bridge long gaps, and only if the move is plausible
  const GPS_FALLBACK_MIN_GAP_MS = 15000;
  const GPS_RESUME_GUARD_MS = 15000;             // after the screen comes back
  const GPS_RESUME_MAX_ACCURACY_METERS = 20;
  const GPS_MIN_POINT_DISTANCE_METERS = 2;
  const GPS_MAX_SPEED_METERS_PER_SECOND = 40;    // 144 km/h; above this (after accuracy allowance) is a jump
  const GPS_MAX_BACKLOG_AGE_MS = 10 * 60 * 1000; // fixes measured while the screen was off may arrive late
  const GPS_FIRST_FIX_MAX_AGE_MS = 30000;
  const GPS_CANDIDATE_TTL_MS = 60000;
  const GPS_DIAG_MAX_LINES = 200;
  const GPS_ROUTE_RENDER_INTERVAL_MS = 1000;
  const GPS_PERSIST_INTERVAL_MS = 5000;
  const gpsRecording = {
    id: '', ownerId: '', status: 'idle', points: [], region: '', startedAt: null,
    elapsedBeforePauseMs: 0, lastResumedAt: null, watcherId: null, webWatcherId: null,
    watcherGeneration: 0, lastError: '', initialized: false
  };
  let backgroundGeolocationPlugin = null;
  let localNotificationsPlugin = null;
  let gpsRecordingUiTimer = null;
  let gpsRecordingPersistTimer = null;
  let gpsRecordingLastPersistAt = 0;
  let gpsRecordingMapTimer = null;
  let gpsRecordingLastMapRenderAt = 0;
  let gpsRecordingMapDirty = false;
  let gpsRecordingDistanceKmValue = 0;
  let gpsWatcherTransitionPromise = null;
  let gpsRecordingLifecycleListenersRegistered = false;
  let gpsPendingSyncRunning = false;
  let gpsRecordingAction = '';
  const gpsProcessingCounts = { panel: 0, modal: 0 };
  let gpsFinishModalOpening = false;
  const GPS_PERF_DEBUG = appConfig.debugGpsPerformance === true
    || (!window.Capacitor?.isNativePlatform?.() && ['localhost', '127.0.0.1'].includes(window.location.hostname));

  function logGpsPerformance(label, startedAt) {
    if (!GPS_PERF_DEBUG) return;
    console.debug(`[GPS perf] ${label}: ${(performance.now() - startedAt).toFixed(1)}ms`);
  }

  function beginGpsWatcherTransition() {
    let resolveTransition;
    const transition = new Promise(resolve => { resolveTransition = resolve; });
    gpsWatcherTransitionPromise = transition;
    return () => {
      resolveTransition();
      if (gpsWatcherTransitionPromise === transition) gpsWatcherTransitionPromise = null;
    };
  }

  async function waitForGpsWatcherTransition() {
    const transition = gpsWatcherTransitionPromise;
    if (transition) await transition;
  }

  function withTimeout(promise, timeoutMs, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  }

  function getStoredSupabaseSession() {
    try {
      const stored = JSON.parse(localStorage.getItem(SUPABASE_AUTH_STORAGE) || 'null');
      const session = stored?.currentSession || stored;
      const claims = decodeJwtPayload(session?.access_token);
      return session?.user?.id && claims?.sub === session.user.id && claims?.session_id ? session : null;
    } catch {
      return null;
    }
  }

  function decodeJwtPayload(token) {
    try {
      const payload = String(token || '').split('.')[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return JSON.parse(atob(base64));
    } catch {
      return null;
    }
  }

  function saveOfflineAccessGrant(session, profile) {
    const claims = decodeJwtPayload(session?.access_token);
    if (!profile || profile.status !== 'approved' || profile.id !== session?.user?.id ||
        claims?.sub !== session.user.id || !claims?.session_id) return false;
    localStorage.setItem(OFFLINE_ACCESS_STORAGE, JSON.stringify({
      version: 1,
      userId: session.user.id,
      sessionId: claims.session_id,
      approved: true,
      nickname: profile.nickname || '',
      verifiedAt: new Date().toISOString()
    }));
    localStorage.removeItem(`${LEGACY_PROFILE_CACHE_PREFIX}${session.user.id}`);
    return true;
  }

  function getOfflineAccessProfile(session) {
    try {
      const grant = JSON.parse(localStorage.getItem(OFFLINE_ACCESS_STORAGE) || 'null');
      const claims = decodeJwtPayload(session?.access_token);
      if (grant?.version !== 1 || grant.approved !== true || !session?.user?.id ||
          grant.userId !== session.user.id || claims?.sub !== grant.userId ||
          !claims?.session_id || grant.sessionId !== claims.session_id) return null;
      return {
        id: grant.userId,
        email: session.user.email || '',
        nickname: grant.nickname || '',
        status: 'offline-approved',
        role: 'offline'
      };
    } catch {
      return null;
    }
  }

  function clearOfflineAccessGrant(userId = state.session?.user?.id) {
    localStorage.removeItem(OFFLINE_ACCESS_STORAGE);
    if (userId) localStorage.removeItem(`${LEGACY_PROFILE_CACHE_PREFIX}${userId}`);
    offlineAccessActive = false;
    onlineAuthVerified = false;
    clearTimeout(offlineRevalidationTimer);
    offlineRevalidationTimer = null;
  }

  function isDefinitiveAuthError(error) {
    const status = Number(error?.status);
    const code = String(error?.code || '').toLowerCase();
    return [400, 401, 403].includes(status) ||
      /invalid.*token|refresh_token|session.*not.*found|user.*not.*found/.test(code);
  }

  function isTransientNetworkError(error) {
    return !Number(error?.status) && /fetch|network|timeout|timed out|offline/i.test(String(error?.message || error || ''));
  }

  function remainingAuthTime(deadline) {
    return Math.max(1, deadline - Date.now());
  }

  function getCachedMapboxToken() {
    const token = localStorage.getItem(MAPBOX_TOKEN_KEY) || localStorage.getItem('powderline.mapboxToken') || '';
    return token.startsWith('pk.') ? token : '';
  }

  async function loadMapboxToken() {
    const cachedToken = getCachedMapboxToken();
    const storedKey = localStorage.getItem(SUPABASE_KEY_STORAGE) || '';
    const publishableKey = isPublishableKey(storedKey) ? storedKey : DEFAULT_SUPABASE_CONFIG.publishableKey;
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), 6000);
    try {
      const response = await fetch(MAPBOX_TOKEN_FUNCTION_URL, {
        method: 'GET',
        headers: { Accept: 'application/json', apikey: publishableKey },
        cache: 'no-store',
        credentials: 'omit',
        signal: abort.signal
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
    } finally {
      clearTimeout(abortTimer);
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
// My-location follow: keeps zoom/pitch/bearing, moves only the center (marker ~10% below screen center)
// once the marker leaves the safe area. Stops on manual pan/rotate/tilt; re-armed by the locate button.
const myLocationFollow = { active: false, syntheticFix: false, recenterNext: false, lastOwnFixAt: 0, resumeAfterShow: false, dragging: false };
function followMyLocation(lng, lat, force = false) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || myLocationFollow.dragging) return;
  const canvas = map.getCanvas();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!force && w > 0 && h > 0) {
    const pt = map.project([lng, lat]);
    if (pt.x >= w * 0.25 && pt.x <= w * 0.75 && pt.y >= h * 0.45 && pt.y <= h * 0.75) return;
  }
  map.easeTo({ center: [lng, lat], offset: [0, h * 0.1], duration: 700, essential: true });
}
// Mapbox fires 'dragstart' for a two-finger pinch as well (the touch-pan handler runs with 2+ fingers). Only a real
// one-finger/mouse drag that does not change zoom ends follow; pinch zoom, zoom buttons, rotate and tilt keep it.
const myLocationTouch = { maxTouches: 0, zoomAtDragStart: 0 };
{
  const container = map.getCanvasContainer();
  const trackTouches = e => { myLocationTouch.maxTouches = Math.max(myLocationTouch.maxTouches, e.touches ? e.touches.length : 0); };
  container.addEventListener('touchstart', trackTouches, { passive: true });
  container.addEventListener('touchmove', trackTouches, { passive: true });
  const resetTouches = e => { if (!e.touches || e.touches.length === 0) myLocationTouch.maxTouches = 0; };
  container.addEventListener('touchend', resetTouches, { passive: true });
  container.addEventListener('touchcancel', resetTouches, { passive: true });
}
map.on('dragstart', e => {
  if (!e.originalEvent) return;
  myLocationFollow.dragging = true;
  myLocationTouch.zoomAtDragStart = map.getZoom();
});
map.on('dragend', () => {
  if (!myLocationFollow.dragging) return;
  myLocationFollow.dragging = false;
  const pinch = myLocationTouch.maxTouches > 1 || Math.abs(map.getZoom() - myLocationTouch.zoomAtDragStart) > 0.01;
  if (!pinch) myLocationFollow.active = false;
});
// GeolocateControl's default camera fit changes zoom; replace with the follow behavior (same control, no extra watch).
geolocateControl._updateCamera = (pos) => {
  const force = !myLocationFollow.active || myLocationFollow.recenterNext;
  myLocationFollow.active = true;
  myLocationFollow.recenterNext = false;
  followMyLocation(pos.coords.longitude, pos.coords.latitude, force);
};
// Arm follow (locate button, recording start, screen-on restore): the next fix recenters, later fixes follow outside the safe area.
function armMyLocationFollow() {
  myLocationFollow.active = true;
  myLocationFollow.dragging = false;
  myLocationFollow.recenterNext = true;
}
// After the screen comes back the WebView may have silently stopped the control's watch: restart it (same control, no extra watcher).
function restoreMyLocationAfterScreenOn() {
  if (!myLocationFollow.resumeAfterShow) return;
  myLocationFollow.resumeAfterShow = false;
  armMyLocationFollow();
  const stale = !myLocationFollow.lastOwnFixAt || Date.now() - myLocationFollow.lastOwnFixAt > 5000;
  if (geolocateControl._geolocationWatchID != null && stale) {
    try {
      geolocateControl._clearWatch();
      geolocateControl._watchState = 'BACKGROUND';
      geolocateControl.trigger();
    } catch (error) { console.warn('My-location watch restart failed:', error); }
  }
  const last = geolocateControl._lastKnownPosition?.coords;
  if (last && Number.isFinite(last.longitude) && Number.isFinite(last.latitude)) {
    myLocationFollow.recenterNext = false;
    followMyLocation(last.longitude, last.latitude, true);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') myLocationFollow.resumeAfterShow = myLocationFollow.active;
  else restoreMyLocationAfterScreenOn();
});
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
  const ownWatch = geolocateControl._geolocationWatchID != null;
  // The control's own watch is delivering fixes: nothing to feed.
  if (ownWatch && myLocationFollow.lastOwnFixAt && Date.now() - myLocationFollow.lastOwnFixAt < 4000) return;
  if (!ws || ws === 'OFF' || ws === 'ACTIVE_ERROR' || ws === 'BACKGROUND_ERROR') {
    geolocateControl._watchState = 'BACKGROUND';
    if (geolocateControl._geolocateButton) {
      geolocateControl._geolocateButton.classList.remove('mapboxgl-ctrl-geolocate-waiting', 'mapboxgl-ctrl-geolocate-active', 'mapboxgl-ctrl-geolocate-active-error', 'mapboxgl-ctrl-geolocate-background-error');
      geolocateControl._geolocateButton.classList.add('mapboxgl-ctrl-geolocate-background');
    }
    // Phone compass listener for the blue heading arrow (the control only adds it when it owns a watch).
    if (typeof geolocateControl._addDeviceOrientationListener === 'function') {
      try { geolocateControl._addDeviceOrientationListener(); } catch {}
    }
  }
  // Party GPS owns the watch: feed every fix to the control so the marker keeps moving.
  if (typeof geolocateControl._onSuccess === 'function') {
    myLocationFollow.syntheticFix = true;
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
    myLocationFollow.syntheticFix = false;
  }
  syncLocateButtonsActiveState();
}
function triggerMyLocationGps({ center = true } = {}) {
  if (center && window.powderlineNativeLocate?.()) return; // Native offline map is showing: it handles position/follow itself
  if (!geolocateControl) return;
  ensureGeolocateControlReady();
  if (center) { pendingLocateToast = true; armMyLocationFollow(); }
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
      myLocationFollow.active = false;
      geolocateControl._updateCamera(lastPos);
      pendingLocateToast = false;
      toast(t('toastGpsActive'));
    } else if (typeof partyGpsRuntime === 'object' && partyGpsRuntime?.lastFix && Number.isFinite(partyGpsRuntime.lastFix.lng) && Number.isFinite(partyGpsRuntime.lastFix.lat)) {
      myLocationFollow.active = true;
      followMyLocation(partyGpsRuntime.lastFix.lng, partyGpsRuntime.lastFix.lat, true);
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
  if (!myLocationFollow.syntheticFix) myLocationFollow.lastOwnFixAt = Date.now();
  const c = e?.coords;
  if (myLocationFollow.active && geolocateControl._watchState !== 'ACTIVE_LOCK' && c) {
    const force = myLocationFollow.recenterNext;
    myLocationFollow.recenterNext = false;
    followMyLocation(c.longitude, c.latitude, force);
  }
  // Fixes fed from the party watcher are already processed there; don't re-enter it.
  if (!myLocationFollow.syntheticFix && typeof handlePartyGeolocateEvent === 'function') handlePartyGeolocateEvent(e);
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
  const profile = { samples: [], timer: null, pending: false, generation: 0, marker: null, layout: null, selected: null, view: null };
  const editHistory = { past: [], future: [], limit: 50 };
  let splitState = null;
  let gapCut = null; // PC web 구간 자르기·연결 session (state.points is untouched until 연결 완료)
  let gapCutKeepProfileOnce = false;
  let segPick = null; // PC graph-based 구간 삭제 session: { phase: 'pickB'|'preview', A, B, parts, cum, n, first }
  let courseSequence = 0, segmentMarker = null;
  let skiLoadToken = 0, lastFacilityState = { status: 'loading', counts: null };
  function updateFacilityStatus(status, counts, message) {
    lastFacilityState = { status, counts };
    const el = $('#facilityStatus');
    if (!el) return;
    if (status === 'loading') el.textContent = t('facilityStatusLoading');
    else if (status === 'available' && counts) el.textContent = t('facilityCounts', counts.lifts || 0, counts.runs || 0, counts.stations || 0);
    else el.textContent = message || t('facilityStatusUnavailable');
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
    if ($('#drawBtn')) $('#drawBtn').textContent = state.drawing ? t('btnFinishDrawing') : t(document.body.dataset.pcWeb === 'true' ? 'btnCreateCoursePc' : 'btnCreateCourse');
    updateAuthUi();
    if (lastFacilityState) updateFacilityStatus(lastFacilityState.status, lastFacilityState.counts);
    if (!profile.samples.length) $('#profileMessage').textContent = t('profileEmptyMsg');
    applyPcEditorLabels();
    renderSaved();
  }

  // PC web shows the GPX point-editing names; Android/mobile keep the original data-i18n labels.
  function applyPcEditorLabels() {
    const pc = document.body.dataset.pcWeb === 'true';
    for (const [selector, key] of [['#editToolBtn', 'toolEdit'], ['#deleteVertexBtn', 'btnDeleteVertex'], ['#satelliteBtn', 'btnSatellite'], ['#topoBtn', 'btnTopo']]) {
      const el = $(selector);
      if (el) el.textContent = t(pc ? key + 'Pc' : key);
    }
    const drawBtn = $('#drawBtn');
    if (drawBtn && !state.drawing) drawBtn.textContent = t(pc ? 'btnCreateCoursePc' : 'btnCreateCourse'); // Android keeps 코스 만들기
    // Short map-style labels on PC (icon + text); the full name stays available as a tooltip.
    for (const [selector, key] of [['#satelliteBtn', 'btnSatellite'], ['#topoBtn', 'btnTopo']]) {
      const el = $(selector);
      if (!el) continue;
      if (pc) el.title = t(key); else el.removeAttribute?.('title');
    }
    if (state.editorMode && state.tool === 'edit' && $('#editorStatus')) $('#editorStatus').textContent = t(pc ? 'statusEditTipPc' : 'statusEditTip');
  }

  function isNativeMobileApp() {
    const cap = window.Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const plat = cap?.getPlatform?.();
    return plat === 'android' || plat === 'ios';
  }

  // PC web = any non-Capacitor browser wider than the mobile breakpoint. Native is never decided by width.
  function isPcWebAuthScope() {
    return !isNativeMobileApp() && !window.matchMedia('(max-width: 768px)').matches;
  }
  // Native app keeps its original width-based gate; every web browser is gated at every width.
  function isAuthGateEnabled() {
    return !isNativeMobileApp() || window.matchMedia('(max-width: 768px)').matches;
  }

  function isApprovedAdmin() {
    return Boolean(
      supabaseClient &&
      state.session?.user &&
      onlineAuthVerified &&
      state.profile?.role === 'admin' &&
      state.profile?.status === 'approved'
    );
  }

  function isPublishableKey(key) {
    return typeof key === 'string' && (key.startsWith('sb_publishable_') || key.startsWith('eyJ'));
  }

  function updateAuthUi(message = '') {
    const configured = Boolean(supabaseClient);
    const signedIn = Boolean(state.session?.user);
    const profile = state.profile;
    const isApproved = onlineAuthVerified && profile?.status === 'approved';
    const isAdmin = isApproved && profile?.role === 'admin';

    // Mobile Auth Display Control (Requirement: unapproved users see Stitch Mobile Auth screens)
    if (typeof syncMobileAuthState === 'function') {
      syncMobileAuthState(message);
    }
    if (typeof syncStitchAccountUI === 'function') {
      syncStitchAccountUI();
    }

    if ($('#authForm')) $('#authForm').hidden = signedIn;
    if ($('#signedInPanel')) $('#signedInPanel').hidden = !signedIn;
    if ($('#pcWithdrawRow')) $('#pcWithdrawRow').hidden = !signedIn; // PC account modal: 회원탈퇴 only for a signed-in user
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
      $('#authStatusBadge').textContent = signedIn && onlineAuthVerified ? t('authOnline') : t('authOffline');
    }
    if ($('#authStatus')) {
      $('#authStatus').textContent = message || (signedIn ? t('authSignedIn', state.session.user.email || '') : configured ? t('authReady') : t('authNeedKey'));
      // PC account modal: the email/status already shows in the account card, so the redundant "connected" line is hidden (errors still show).
      $('#authStatus').hidden = document.body.dataset.pcWeb === 'true' && signedIn && !message;
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
    if (typeof syncPcHeaderAuth === 'function') syncPcHeaderAuth();
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
    if (state.profile?.role === 'admin' && state.profile?.status === 'approved') {
      await loadPendingUsers();
    }
    return state.profile;
  }

  async function loadPendingUsers() {
    if (!supabaseClient || state.profile?.role !== 'admin' || state.profile?.status !== 'approved') return;
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
    if (typeof syncStitchAccountUI === 'function') syncStitchAccountUI();
    if (typeof syncPcHeaderAuth === 'function') syncPcHeaderAuth();
    if (typeof renderPcAdminPending === 'function' && !$('#pcAdminModal')?.hidden) renderPcAdminPending();
  }

  async function handleSetUserStatus(targetUserId, newStatus) {
    if (!supabaseClient || state.profile?.role !== 'admin' || state.profile?.status !== 'approved') return;
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

  const CLOUD_ROUTES_CACHE_PREFIX = 'powderline.cloudRoutes.v1.';
  function cacheCloudRoutes(userId, routes) {
    try { localStorage.setItem(CLOUD_ROUTES_CACHE_PREFIX + userId, JSON.stringify(routes)); return true; } catch (error) { console.warn('Cloud route cache write failed:', error); return false; }
  }
  // A just-saved cloud course goes into the account cache right away (add or replace by id), so it is
  // available offline without waiting for the next full list sync. Other cached courses stay as they are.
  function upsertCachedCloudRoute(userId, route) {
    if (!userId || !route?.id || !Array.isArray(route.points)) return false;
    const rest = readCachedCloudRoutes(userId).filter(item => item.id !== route.id);
    return cacheCloudRoutes(userId, [route, ...rest]);
  }
  function readCachedCloudRoutes(userId) {
    if (!userId) return [];
    try {
      const cached = JSON.parse(localStorage.getItem(CLOUD_ROUTES_CACHE_PREFIX + userId) || '[]');
      return Array.isArray(cached) ? cached.filter(route => route?.id && Array.isArray(route.points)) : [];
    } catch { return []; }
  }
  function useLocalRoutes() {
    const ownerId = state.session?.user?.id || '';
    const localRoutes = JSON.parse(localStorage.getItem('powderline.routes') || '[]')
      .filter(route => !route?.recordingOwnerId || route.recordingOwnerId === ownerId);
    const pendingRoutes = ownerId ? getPendingGpsRoutes(ownerId) : [];
    const known = new Set([...pendingRoutes, ...localRoutes].map(route => route.id));
    // Courses saved to the account are shown from the last sync when the server cannot be reached.
    const cachedCloud = readCachedCloudRoutes(ownerId).filter(route => !known.has(route.id));
    state.saved = [...pendingRoutes, ...localRoutes.filter(route => !pendingRoutes.some(pending => pending.id === route.id)), ...cachedCloud];
    renderSaved();
  }

  async function loadCloudRoutes({ notify = false } = {}) {
    if (!supabaseClient || !state.session?.user) return;
    const client = supabaseClient;
    const userId = state.session.user.id;
    const { data, error } = await client
      .from('powderline_routes')
      .select('id,user_id,name,region,points,distance_km,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (client !== supabaseClient || state.session?.user?.id !== userId) return;
    if (error) {
      updateAuthUi(error.message);
      toast(error.message);
      return;
    }
    const cloudRoutes = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      region: row.region,
      points: Array.isArray(row.points) ? row.points.filter(point => Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat))).map(point => ({ ...point, lng: Number(point.lng), lat: Number(point.lat) })) : [],
      km: Number.isFinite(Number(row.distance_km)) ? Number(row.distance_km) : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ownerId: row.user_id,
      source: 'cloud'
    }));
    // A successful sync replaces the cache, so courses deleted elsewhere disappear here too (errors return above).
    cacheCloudRoutes(userId, cloudRoutes);
    state.saved = mergePendingGpsRoutes(cloudRoutes, userId);
    renderSaved();
    if (notify) toast(t('toastCloudLoaded'));
  }

  // Deletable = the signed-in user's own cloud course, or a course stored only on this device (GPX import / local save).
  // Pending GPS recordings, other users' (party-shared) and built-in courses are never deletable.
  function canDeleteSavedRoute(route) {
    if (!route || route.syncStatus === 'pending' || route.recordingOwnerId) return false;
    if (route.source === 'cloud') return Boolean(route.id && state.session?.user?.id && route.ownerId === state.session.user.id);
    return route.source === 'local';
  }
  // Removes exactly this local course from 'powderline.routes'; cloud courses and other local courses stay untouched.
  function removeLocalSavedRoute(route) {
    try {
      const stored = JSON.parse(localStorage.getItem('powderline.routes') || '[]');
      const key = JSON.stringify(route);
      const at = stored.findIndex(item => JSON.stringify(item) === key);
      if (at >= 0) { stored.splice(at, 1); localStorage.setItem('powderline.routes', JSON.stringify(stored)); }
    } catch (error) { console.warn('Local route removal failed:', error); }
  }
  // Returns true only when the course is really gone; on any failure the list, caches and local files stay as they were.
  async function deleteSavedRoute(route) {
    if (!canDeleteSavedRoute(route)) { toast('직접 만든 코스만 삭제할 수 있습니다.'); return false; }
    if (route.source === 'cloud') {
      const userId = state.session?.user?.id;
      if (!supabaseClient || !userId || navigator.onLine === false) {
        toast('오프라인 상태에서는 계정에 저장된 코스를 삭제할 수 없습니다. 온라인에서 다시 시도해 주세요.');
        return false;
      }
      try {
        const { data, error } = await supabaseClient.from('powderline_routes').delete()
          .eq('id', route.id).eq('user_id', userId).select('id');
        if (error) throw error;
        if (!data?.length) {
          toast('코스를 삭제하지 못했습니다. 이미 삭제되었거나 삭제 권한이 없습니다.');
          void loadCloudRoutes();
          return false;
        }
      } catch (error) {
        console.error('Course delete failed:', error);
        toast(`코스 삭제 실패: ${error?.message || '네트워크 오류'}`);
        return false;
      }
      state.saved = state.saved.filter(item => !(item.source === 'cloud' && item.id === route.id));
      cacheCloudRoutes(userId, readCachedCloudRoutes(userId).filter(item => item.id !== route.id));
      return true;
    }
    removeLocalSavedRoute(route);
    state.saved = state.saved.filter(item => item !== route);
    return true;
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
const PARTY_GPS_FIX_MAX_AGE_MS = 120000;
const PARTY_GPS_RPC_TIMEOUT_MS = 12000;
const PARTY_GPS_FRESH_FIX_TIMEOUT_MS = 12000;
const PARTY_GPS_SEND_BACKOFF_BASE_MS = 5000;
const PARTY_GPS_SEND_BACKOFF_MAX_MS = 120000;
const PARTY_GPS_RECOVER_MIN_GAP_MS = 2000;
let partyGpsLifecycleListenersRegistered = false;
const partyMemberMarkers = new Map();
const partyGpsRuntime = {
  freshFixRequesting: false,
  sendFailCount: 0,
  nextSendAllowedAt: 0,
  lastRecoverAt: 0,
  partyId: '',
  watchId: null,
  watchRetryTimer: null,
  watchRetryCount: 0,
  sendTimer: null,
  pollTimer: null,
  lastFix: null,
  anchorFix: null,
  powerSaveMode: false,
  lastSentAt: 0,
  lastSentFixTimestamp: 0,
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

function syncRegionSelectors() {
  const active = Object.entries(regions)
    .filter(([, details]) => !details.custom && details.isActive !== false)
    .sort((a, b) => (a[1].sortOrder ?? 999) - (b[1].sortOrder ?? 999));
  const skiSuffix = status => status === 'pending' || status === 'processing' ? ' · 데이터 준비 중' : status === 'failed' ? ' · 데이터 준비 실패' : '';
  const options = active.map(([id, details]) => `<option value="${escapeHtml(id)}">${escapeHtml(details.label + skiSuffix(details.skiDataStatus))}</option>`).join('');
  const fallback = active.some(([id]) => id === 'furano') ? 'furano' : active[0]?.[0] || '';
  for (const id of ['region', 'mobileRegionSelect', 'homeRegionSelect', 'rideRegionSelect', 'partyCreateRegion']) {
    const select = $(`#${id}`);
    if (!select) continue;
    const previous = select.value;
    select.innerHTML = options;
    if (id === 'region' && regions[previous]?.custom) {
      const customOption = new Option(regions[previous].label, previous);
      customOption.dataset.courseCustom = 'true';
      select.add(customOption);
    }
    select.value = [...select.options].some(option => option.value === previous) ? previous : fallback;
  }
  renderMobileCourseRegions();
  renderMobileHome();
  // PC course folders use region display names; refresh them when the catalog (labels) changes.
  if (document.body.dataset.pcWeb === 'true' && typeof renderSaved === 'function') renderSaved();
}

function parseRegionBbox(value) {
  let bbox = value;
  if (typeof bbox === 'string') {
    try { bbox = JSON.parse(bbox); } catch { return null; }
  }
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const numbers = bbox.map(Number);
  return numbers.every(Number.isFinite) && numbers[0] < numbers[2] && numbers[1] < numbers[3]
    ? numbers
    : null;
}

const REGION_CATALOG_CACHE_KEY = 'powderline.regionCatalog.v1';
function applyRegionRows(data) {
  for (const row of data) {
    regions[row.id] = {
      label: row.label, center: [row.center_lng, row.center_lat],
      zoom: row.zoom, bearing: row.bearing, pitch: row.pitch,
      sortOrder: row.sort_order, isActive: row.is_active,
      bbox: parseRegionBbox(row.bbox),
      skiDataStatus: row.ski_data_status, skiDataVersion: row.offline_data_version, skiDataError: row.ski_data_error
    };
    catalogRegionIds.add(row.id);
  }
}
// Last successful server catalog, so the app (also offline) knows every registered region, not just the built-in ones.
function cacheRegionCatalog(data) {
  try {
    const rows = data.map(row => ({ id: row.id, label: row.label, center_lng: row.center_lng, center_lat: row.center_lat, zoom: row.zoom,
      bearing: row.bearing, pitch: row.pitch, sort_order: row.sort_order, is_active: row.is_active, bbox: row.bbox,
      ski_data_status: row.ski_data_status, ski_data_error: row.ski_data_error, offline_data_version: row.offline_data_version }));
    localStorage.setItem(REGION_CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows }));
  } catch (error) { console.warn('Region catalog cache write failed:', error); }
}
function restoreCachedRegionCatalog() {
  if (catalogRegionIds.size) return false; // a live catalog is already applied
  try {
    const cached = JSON.parse(localStorage.getItem(REGION_CATALOG_CACHE_KEY) || 'null');
    if (!Array.isArray(cached?.rows) || !cached.rows.length) return false;
    applyRegionRows(cached.rows.filter(row => row?.id && Number.isFinite(Number(row.center_lng)) && Number.isFinite(Number(row.center_lat))));
    syncRegionSelectors();
    return true;
  } catch (error) { console.warn('Region catalog cache read failed:', error); return false; }
}

async function loadRegionCatalog(client) {
  try {
    const { data, error } = await client.from('powderline_regions')
      .select('id,label,center_lng,center_lat,zoom,bearing,pitch,sort_order,is_active,is_default,bbox,ski_data_status,ski_data_error,ski_data_feature_count,ski_data_file_size,offline_data_version,ski_data_requested_at,ski_data_started_at,ski_data_completed_at')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (client !== supabaseClient) return { error: new Error('연결이 변경되었습니다.') };
    if (!builtInRegionIds.size || ![...builtInRegionIds].every(id => data?.some(row => row.id === id))) {
      throw new Error('기본 지역을 모두 불러오지 못했습니다.');
    }
    for (const id of catalogRegionIds) if (regions[id]) regions[id].isActive = false;
    applyRegionRows(data);
    cacheRegionCatalog(data);
    if (state.profile?.id === state.session?.user?.id &&
        state.profile?.role === 'admin' && state.profile?.status === 'approved') adminRegionRows = data;
    syncRegionSelectors();
    if (mobileHomeMapMode === 'offline') void refreshOfflineRegionStatuses();
    return { data };
  } catch (error) {
    console.warn('Region catalog unavailable; keeping existing regions:', error);
    return { error };
  }
}

function createAuthVerificationError(error, fallbackMessage, definitive = false) {
  const verificationError = new Error(error?.message || fallbackMessage);
  verificationError.cause = error;
  verificationError.definitive = definitive || isDefinitiveAuthError(error);
  return verificationError;
}

async function verifyOnlineAccess(client) {
  const deadline = Date.now() + INITIAL_AUTH_TIMEOUT_MS;
  const sessionResult = await withTimeout(
    client.auth.getSession(), remainingAuthTime(deadline), 'Supabase session restore timed out.'
  );
  if (sessionResult.error) throw createAuthVerificationError(sessionResult.error, 'Session restore failed.');
  const session = sessionResult.data?.session || null;
  if (!session) return { session: null, profile: null };

  const userResult = await withTimeout(
    client.auth.getUser(session.access_token), remainingAuthTime(deadline), 'Supabase user verification timed out.'
  );
  if (userResult.error || userResult.data?.user?.id !== session.user?.id) {
    throw createAuthVerificationError(
      userResult.error,
      'Supabase user verification failed.',
      !userResult.error || !isTransientNetworkError(userResult.error)
    );
  }

  const profileResult = await withTimeout(
    client.from('profiles').select('id,email,nickname,status,role').eq('id', session.user.id).single(),
    remainingAuthTime(deadline),
    'Profile verification timed out.'
  );
  if (profileResult.error || profileResult.data?.id !== session.user.id) {
    throw createAuthVerificationError(
      profileResult.error,
      'Profile verification failed.',
      !profileResult.error || !isTransientNetworkError(profileResult.error)
    );
  }
  return { session, profile: profileResult.data };
}

function scheduleOfflineRevalidation(delay = 30000) {
  clearTimeout(offlineRevalidationTimer);
  if (!offlineAccessActive) return;
  offlineRevalidationTimer = setTimeout(() => {
    if (navigator.onLine !== false) revalidateOfflineAccess();
    else scheduleOfflineRevalidation(30000);
  }, delay);
}

async function revalidateOfflineAccess() {
  if (!offlineAccessActive || offlineRevalidationRunning) return;
  offlineRevalidationRunning = true;
  try {
    await initializeSupabase();
  } finally {
    offlineRevalidationRunning = false;
  }
}

function activateOfflineAccess(client, error) {
  const session = getStoredSupabaseSession();
  const profile = getOfflineAccessProfile(session);
  onlineAuthVerified = false;
  offlineAccessActive = Boolean(session && profile);
  if (offlineAccessActive) client?.auth?.stopAutoRefresh?.();
  supabaseClient = offlineAccessActive ? null : client;
  state.session = offlineAccessActive ? session : null;
  state.profile = offlineAccessActive ? profile : null;
  useLocalRoutes();
  authInitializationComplete = true;
  updateAuthUi(offlineAccessActive ? '오프라인 모드 · 로컬 기능만 사용할 수 있습니다.' : (error?.message || '온라인 인증이 필요합니다.'));
  if (offlineAccessActive) scheduleOfflineRevalidation();
  return offlineAccessActive;
}

async function initializeSupabase(key=localStorage.getItem(SUPABASE_KEY_STORAGE)||DEFAULT_SUPABASE_CONFIG.publishableKey){
  restoreCachedRegionCatalog(); // independent of the network: known regions are available before/without the server
  const wasOfflineAccess = offlineAccessActive;
  if (!wasOfflineAccess) {
    authInitializationComplete=false;
    syncMobileAuthState();
  }
  if (typeof stopPartyGpsRuntime === 'function') stopPartyGpsRuntime({ clearMarkers: true });
  supabaseAuthSubscription?.unsubscribe();
  supabaseAuthSubscription=null;
  supabaseClient=null;
  onlineAuthVerified=false;
  state.partySchemaReady=false;
  state.myParties=[];
  state.currentParty=null;
  renderPartyMain();
  setPartyCreateAvailability();
  if(!isPublishableKey(key)){
    if (!wasOfflineAccess) {
      state.session=null;
      state.profile=null;
    }
    authInitializationComplete=true;
    updateAuthUi();
    useLocalRoutes();
    return false;
  }
  if (!window.supabase?.createClient) {
    if (activateOfflineAccess(null, new Error(t('toastSupabaseUnavailable')))) return true;
    toast(t('toastSupabaseUnavailable'));
    return false;
  }

  const client = window.supabase.createClient(SUPABASE_URL, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: SUPABASE_AUTH_STORAGE }
  });
  let verified;
  try {
    if (navigator.onLine === false) throw new Error('Network is offline.');
    verified = await verifyOnlineAccess(client);
  } catch (error) {
    console.warn('Online authentication verification failed:', error);
    if (error.definitive) clearOfflineAccessGrant();
    return activateOfflineAccess(client, error);
  }
  supabaseClient=client;

  const { session, profile } = verified;
  state.session=session;
  state.profile=profile;
  onlineAuthVerified=Boolean(session);
  if ((!session || profile?.status !== 'approved') && gpsRecording.status === 'recording') {
    await pauseGpsRecording();
  }
  offlineAccessActive=false;
  clearTimeout(offlineRevalidationTimer);
  offlineRevalidationTimer=null;
  if (session && profile?.status === 'approved') saveOfflineAccessGrant(session, profile);
  else clearOfflineAccessGrant(session?.user?.id);
  useLocalRoutes();

  const { data } = client.auth.onAuthStateChange(async (event, nextSession) => {
    if (client !== supabaseClient) return;
    const previousUserId = state.session?.user?.id;
    state.session=nextSession||null;
    if (!nextSession) {
      await stopGpsRecordingWatcher();
      resetGpsRecordingState();
      gpsRecording.initialized=false;
      if (event === 'SIGNED_OUT') {
        clearOfflineAccessGrant(previousUserId);
        if (previousUserId) { try { localStorage.removeItem(CLOUD_ROUTES_CACHE_PREFIX + previousUserId); } catch { } }
      }
      onlineAuthVerified=false;
      state.profile=null;
      updateAuthUi();
      useLocalRoutes();
      return;
    }
    if (nextSession.user.id === previousUserId &&
        (event === 'USER_UPDATED' || (event === 'SIGNED_IN' && accountPasswordReauthUserId === previousUserId))) {
      updateAuthUi();
      return;
    }
    const nextProfile = await loadUserProfile();
    onlineAuthVerified=Boolean(nextProfile);
    if (nextProfile) updateAuthUi(); // re-render now that verification is known (gate, header, admin menu)
    if (nextProfile?.status === 'approved') {
      saveOfflineAccessGrant(nextSession, state.profile);
      if (nextSession.user.id !== previousUserId) await loadCloudRoutes({ notify: event === 'SIGNED_IN' });
      await restoreGpsRecording();
      void syncPendingGpsRoutes();
    } else if (nextProfile) {
      clearOfflineAccessGrant(nextSession.user.id);
      useLocalRoutes();
    } else {
      activateOfflineAccess(client, new Error('Online profile verification failed.'));
      return;
    }
    await Promise.allSettled([loadMyParties(), loadReceivedPartyInvites()]);
  });
  supabaseAuthSubscription=data?.subscription;
  authInitializationComplete=true;
  updateAuthUi();

  const backgroundTasks=[
    withTimeout(loadRegionCatalog(client), INITIAL_AUTH_TIMEOUT_MS, 'Region sync timed out.')
  ];
  if (session && profile?.status === 'approved') {
    backgroundTasks.push(
      withTimeout((async () => { await loadCloudRoutes(); await syncPendingGpsRoutes(); })(), INITIAL_AUTH_TIMEOUT_MS * 2, 'Route sync timed out.'),
      withTimeout(loadMyParties(), INITIAL_AUTH_TIMEOUT_MS, 'Party sync timed out.'),
      withTimeout(loadReceivedPartyInvites(), INITIAL_AUTH_TIMEOUT_MS, 'Invite sync timed out.')
    );
  }
  void Promise.allSettled(backgroundTasks);
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

    // 1. Lift line: thin blue dashed (always thinner than runs and GPX route at every zoom)
    map.addLayer({
      id: 'ski-lifts-line',
      type: 'line',
      source: 'ski-facilities',
      filter: ['==', ['get', 'powderlineType'], 'lift'],
      paint: {
        'line-color': ['case', ['==', ['get', 'id'], state.selectedLiftId || ''], '#1d4ed8', '#2563eb'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 12, 0.9, 15, 1.5],
        'line-dasharray': [4, 3],
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
    map.addSource('gps-recording-route', { type: 'geojson', data: emptyCollection });
    map.addLayer({ id: 'gps-recording-glow', type: 'line', source: 'gps-recording-route', paint: { 'line-color': '#38bdf8', 'line-width': 9, 'line-opacity': 0.25, 'line-blur': 2 } });
    map.addLayer({ id: 'gps-recording-line', type: 'line', source: 'gps-recording-route', paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-opacity': 1 } });
  }
  function restoreLayerVisibility() { setLayerVisibility(['ski-lifts-line', 'ski-lifts-label', 'ski-lifts', 'ski-lift-terminals'], $('#liftsToggle').checked); setLayerVisibility(['ski-runs'], $('#runsToggle').checked); setLayerVisibility(['route-glow', 'route-line', 'route-points', 'route-midpoints'], $('#gpxToggle').checked) }
  map.on('style.load', () => { if (!hasMapboxToken) { $('#mapStatus').textContent = t('mapStatusNeedToken'); return } $('#mapStatus').textContent = t('mapStatusLoading'); setTerrain(); addSkiLayers(); addRouteLayers(); loadSkiData($('#region').value); render(); restoreLayerVisibility() });
  map.on('sourcedata', e => { if (e.sourceId === 'mapbox-dem' && e.isSourceLoaded) { $('#mapStatus').textContent = t('mapStatusReady'); if (profile.pending) scheduleProfile(80) } });
  map.on('idle', () => { if (profile.pending) scheduleProfile(0) });
  map.on('error', e => { if (e.sourceId === 'mapbox-dem') $('#mapStatus').textContent = t('mapStatusDemUnavailable') });
  function setMapStyle(style) { if (!hasMapboxToken) return toast(t('toastNeedToken')); state.mapStyle = style; const topo = style === 'topo'; $('#satelliteBtn').classList.toggle('active', !topo); $('#topoBtn').classList.toggle('active', topo); $('#satelliteBtn').setAttribute('aria-pressed', String(!topo)); $('#topoBtn').setAttribute('aria-pressed', String(topo)); map.setStyle(MAPBOX_STYLES[style]); toast(topo ? t('toastStyleTopo') : t('toastStyleSatellite')) }
  async function loadSkiData(region) {
    const token = ++skiLoadToken; updateFacilityStatus('loading'); try {
      const serverReady = regions[region]?.skiDataStatus === 'ready' && regions[region]?.skiDataVersion;
      let response = serverReady
        ? await fetch(`${SUPABASE_URL}/storage/v1/object/public/ski-data/${encodeURIComponent(region)}.geojson?v=${encodeURIComponent(regions[region].skiDataVersion)}`).catch(() => null)
        : null;
      if (!response?.ok) response = await fetch(new URL(`./data/ski/${region}.geojson`, document.baseURI)).catch(() => null);
      if (!response?.ok) {
        const info = regions[region], st = info?.skiDataStatus;
        if (st === 'ready') { const v = info.skiDataVersion ? `?v=${encodeURIComponent(info.skiDataVersion)}` : ''; response = await fetch(`${SUPABASE_URL}/storage/v1/object/public/ski-data/${encodeURIComponent(region)}.geojson${v}`) }
        else {
          const msg = { empty: '리프트·슬로프 데이터 없음', pending: '데이터 준비 중', processing: '데이터 준비 중', failed: '데이터 수집 실패' }[st];
          map.getSource('ski-facilities')?.setData(emptyCollection); map.getSource('ski-lift-towers')?.setData(emptyCollection); map.getSource('ski-lift-terminals')?.setData(emptyCollection);
          updateFacilityStatus('unavailable', null, msg); return
        }
      }
      if (!response.ok) throw new Error(String(response.status)); const data = await response.json(); if (token !== skiLoadToken) return; const source = map.getSource('ski-facilities'); if (!source) return; source.setData(data); const c = data.metadata?.counts || {};
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
      if (error?.message !== '404') console.warn('Ski data error', error);
    }
  }
  function setLayerVisibility(ids, visible) { ids.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') }) }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])) }
  function localizedLiftType(value) { const typesKo = { gondola: '곤돌라', chair_lift: '체어리프트', chairlift: '체어리프트', drag_lift: '견인식 리프트', 't-bar': 'T바 리프트', 'j-bar': 'J바 리프트', platter: '플래터 리프트', rope_tow: '로프 토', cable_car: '케이블카', mixed_lift: '혼합형 리프트', magic_carpet: '무빙워크' }; const typesEn = { gondola: 'Gondola', chair_lift: 'Chairlift', chairlift: 'Chairlift', drag_lift: 'Drag Lift', 't-bar': 'T-Bar', 'j-bar': 'J-Bar', platter: 'Platter', rope_tow: 'Rope Tow', cable_car: 'Cable Car', mixed_lift: 'Mixed Lift', magic_carpet: 'Magic Carpet' }; const val = String(value || '').toLowerCase(); const dict = state.lang === 'en' ? typesEn : typesKo; return dict[val] || value || t('liftTypeUnknown') }
  function updateLiftSelection(liftId) {
    state.selectedLiftId = liftId;
    if (map.getLayer('ski-lifts-line')) {
      map.setPaintProperty('ski-lifts-line', 'line-color', ['case', ['==', ['get', 'id'], state.selectedLiftId || ''], '#1d4ed8', '#2563eb']);
    }
    if (map.getLayer('ski-lifts-label')) {
      map.setFilter('ski-lifts-label', ['all', ['==', ['get', 'powderlineType'], 'lift'], ['==', ['get', 'id'], state.selectedLiftId || '']]);
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

  ['ski-lifts', 'ski-lift-terminals'].forEach(layerId => {
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

  function blockedByGapCut() {
    if (!gapCut) return false;
    toast(state.lang === 'ko' ? '구간 자르기 중입니다. 연결 완료 또는 취소 후 사용해 주세요.' : 'Finish or cancel the section cut first.');
    return true;
  }

  function undo() {
    if (blockedByGapCut()) return;
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
    if (blockedByGapCut()) return;
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
    if (tool !== 'gap-cut' && gapCut) cancelGapCut(false);
    if (tool !== 'delete-segment' && segPick) cancelSegPick(false); // stale graph picks never leak into another tool
    if (tool === 'gap-cut' && !gapCut && !startGapCut()) return;
    state.tool = tool;
    document.querySelectorAll('.tool-grid button').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    for (const [id, name] of [['#mobileToolDraw', 'draw'], ['#mobileToolEdit', 'edit'], ['#mobileToolCut', 'cut'], ['#mobileToolDeleteSegment', 'delete-segment']]) {
      const button = $(id);
      if (button) { button.classList.toggle('active', name === tool); button.setAttribute('aria-pressed', String(name === tool)); }
    }
    state.segmentStart = null;
    if (tool !== 'delete-segment') syncSegPickUi();
    else if (pcSparseEditing()) $('#profileChart')?.classList.add('gap-cut-pick');
    $('#profileChart')?.classList.toggle('gap-cut-pick', pcSparseEditing() && ['edit', 'cut', 'delete-segment'].includes(tool));
    const el = $('#editorStatus');
    if (!el) return;
    if (tool === 'draw') el.textContent = t('statusDrawTip');
    else if (tool === 'edit') el.textContent = t(pcSparseEditing() ? 'statusEditTipPc' : 'statusEditTip');
    else if (tool === 'cut') el.textContent = t('statusCutTip');
    else if (tool === 'delete-segment') el.textContent = t('statusDeleteSegTip');
    else if (tool === 'gap-cut') syncGapCutUi();
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
    if (gapCut) cancelGapCut(false);
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
        if (gapCut) { cancelGapCut(false); setEditorTool('edit'); }
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

  // ---- PC web GPX editing ----
  // An imported GPX keeps every coordinate in state.points (line, distance, profile, save and GPX export are
  // unchanged). On PC web the intermediate coordinates carry `shape: true`: they shape the line but get no edit
  // marker. Start/end always get one; points the user adds are plain points, so every existing tool (drag,
  // delete, cut, segment delete) works on them by their real index. Android never sets/uses the flag.
  function pcSparseEditing() { return document.body.dataset.pcWeb === 'true'; }
  function isEditAnchor(points, i) {
    return !pcSparseEditing() || i === 0 || i === points.length - 1 || !points[i]?.shape;
  }
  function markGpxShapePoints(points) {
    if (!pcSparseEditing()) return points;
    points.forEach((point, i) => { if (i > 0 && i < points.length - 1) point.shape = true; });
    return points;
  }
  // Saving (no DB change: powderline_routes.points is a free jsonb array and every client keeps extra keys).
  // A course with shape coordinates stores `anchor: true` on its edit points only (a few keys, not thousands);
  // an ordinary drawn course has no shape coordinates, so its payload stays exactly { lng, lat } as before.
  function encodeEditPointsForSave(points) {
    const sparse = points.some(point => point?.shape);
    return points.map(point => {
      const out = { lng: Number(point.lng), lat: Number(point.lat) };
      if (sparse && !point.shape) out.anchor = true;
      return out;
    });
  }
  // Legacy saves (made before anchors were stored) that look like a recorded/GPX track: many, densely spaced
  // coordinates. Hand-drawn courses (few clicks, long spacing) never match, so their points all stay editable.
  const GPX_TRACK_MIN_POINTS = 300;
  const GPX_TRACK_MAX_MEDIAN_M = 25;
  function looksLikeGpxTrack(points) {
    if (points.length < GPX_TRACK_MIN_POINTS) return false;
    const gaps = [];
    for (let i = 1; i < points.length; i++) gaps.push(horizontalMeters(points[i - 1], points[i]));
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] <= GPX_TRACK_MAX_MEDIAN_M;
  }
  // Loading a saved course for editing: same marker rule as a fresh GPX import (PC web only; elsewhere this is
  // the plain copy the callers used before). Coordinates are never changed.
  function prepareEditPoints(points) {
    const copy = (points || []).map(point => ({ ...point }));
    if (!pcSparseEditing() || copy.length < 3) return copy;
    if (copy.some(point => point.shape)) return copy;                 // device-local save: flags kept as-is
    if (copy.some(point => point.anchor)) {                           // cloud save with stored edit points
      copy.forEach((point, i) => {
        if (i > 0 && i < copy.length - 1 && !point.anchor) point.shape = true;
        delete point.anchor;
      });
      return copy;
    }
    return looksLikeGpxTrack(copy) ? markGpxShapePoints(copy) : copy; // legacy GPX save vs. hand-drawn course
  }
  // 'edit' tool click on the route line: promote the nearest shape coordinate, or insert a point on the segment
  // (never changes the line's shape). Returns true when a point was added.
  function addEditPointAt(screenPoint, tolerancePx = 14) {
    const pts = state.points;
    if (!pcSparseEditing() || pts.length < 2) return false;
    let best = null;
    let prev = map.project([pts[0].lng, pts[0].lat]);
    for (let i = 0; i < pts.length - 1; i++) {
      const next = map.project([pts[i + 1].lng, pts[i + 1].lat]);
      const dx = next.x - prev.x, dy = next.y - prev.y, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((screenPoint.x - prev.x) * dx + (screenPoint.y - prev.y) * dy) / len2)) : 0;
      const d2 = (prev.x + t * dx - screenPoint.x) ** 2 + (prev.y + t * dy - screenPoint.y) ** 2;
      if (d2 <= tolerancePx * tolerancePx && (!best || d2 < best.d2)) best = { i, t, d2, segPx: Math.sqrt(len2) };
      prev = next;
    }
    if (!best) return false;
    pushHistory();
    const a = pts[best.i], b = pts[best.i + 1];
    // Promote the closer segment end if the click is within 6px of it; otherwise insert on the segment.
    const closerIsA = best.t <= 0.5;
    const endGapPx = (closerIsA ? best.t : 1 - best.t) * best.segPx;
    let index;
    if (endGapPx <= 6 && closerIsA && a.shape) { index = best.i; delete a.shape; }
    else if (endGapPx <= 6 && !closerIsA && b.shape) { index = best.i + 1; delete b.shape; }
    else {
      index = best.i + 1;
      pts.splice(index, 0, { lng: a.lng + (b.lng - a.lng) * best.t, lat: a.lat + (b.lat - a.lat) * best.t });
    }
    state.selectedVertex = index;
    syncActiveCoursePoints();
    renderCourseWorkList();
    render();
    toast(state.lang === 'ko' ? '편집 포인트를 추가했습니다. 드래그해 이동하고, 더블클릭하면 삭제됩니다.' : 'Edit point added. Drag to move, double-click to delete.');
    return true;
  }
  // Dragging point i moves only the shape coordinates between its neighbouring edit points, with a smooth
  // falloff (1 at the point → 0 at the neighbours). Everything outside that span keeps its original form.
  function buildDragFalloff(i) {
    const pts = state.points;
    if (!pcSparseEditing()) return null;
    let a = null, b = null;
    for (let j = i - 1; j >= 0; j--) if (isEditAnchor(pts, j)) { a = j; break; }
    for (let j = i + 1; j < pts.length; j++) if (isEditAnchor(pts, j)) { b = j; break; }
    const from = a === null ? i : a + 1, to = b === null ? i : b - 1;
    if (to - from < 1) return null; // no shape coordinates next to this point → plain single-point drag
    const lo = a ?? i, hi = b ?? i, cum = { [lo]: 0 };
    for (let k = lo + 1; k <= hi; k++) {
      const p = pts[k - 1], q = pts[k], cos = Math.cos((p.lat + q.lat) * Math.PI / 360);
      cum[k] = cum[k - 1] + Math.hypot((q.lng - p.lng) * cos, q.lat - p.lat);
    }
    const ease = t => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;
    const weights = [], orig = [];
    for (let k = from; k <= to; k++) {
      orig.push({ ...pts[k] });
      if (k === i) weights.push(1);
      else if (k < i) weights.push(ease(cum[i] - cum[lo] > 0 ? (cum[k] - cum[lo]) / (cum[i] - cum[lo]) : 1));
      else weights.push(ease(cum[hi] - cum[i] > 0 ? (cum[hi] - cum[k]) / (cum[hi] - cum[i]) : 1));
    }
    return { from, to, weights, orig, origin: orig[i - from] };
  }
  function applyDragFalloff(falloff, lngLat) {
    const dLng = lngLat.lng - falloff.origin.lng, dLat = lngLat.lat - falloff.origin.lat;
    for (let k = falloff.from; k <= falloff.to; k++) {
      const o = falloff.orig[k - falloff.from], w = falloff.weights[k - falloff.from];
      state.points[k] = { ...o, lng: o.lng + dLng * w, lat: o.lat + dLat * w };
    }
  }

  // ---- PC web: 구간 자르기·연결 (gap cut) ----
  // A route position is a fractional index s = i + t on segment (i, i+1), so A/B can sit anywhere on the line,
  // and two passes through the same spot (loops, out-and-back) stay distinct because their s (route order) differs.
  function routeLineCandidates(points, screenPoint, project, tolerancePx = 14) {
    const hits = [], tol2 = tolerancePx * tolerancePx;
    let prev = project(points[0]);
    for (let i = 0; i < points.length - 1; i++) {
      const next = project(points[i + 1]);
      const dx = next.x - prev.x, dy = next.y - prev.y, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((screenPoint.x - prev.x) * dx + (screenPoint.y - prev.y) * dy) / len2)) : 0;
      const d2 = (prev.x + t * dx - screenPoint.x) ** 2 + (prev.y + t * dy - screenPoint.y) ** 2;
      if (d2 <= tol2) hits.push({ i, t, d2 });
      prev = next;
    }
    // Contiguous segments near the click are one pass of the route through that spot; keep the closest per pass.
    const passes = [];
    for (const h of hits) {
      const last = passes.at(-1);
      if (last && h.i - last.lastI <= 1) { last.lastI = h.i; if (h.d2 < last.best.d2) last.best = h; }
      else passes.push({ lastI: h.i, best: h });
    }
    return passes.map(p => ({ s: p.best.i + p.best.t, d2: p.best.d2 }));
  }
  function routePosition(points, s) {
    const last = points.length - 1;
    let i = Math.floor(Math.max(0, Math.min(last, s))), t = Math.max(0, Math.min(last, s)) - i;
    if (i >= last) { i = last - 1; t = 1; }
    if (t > 1 - 1e-9) { i += 1; t = 0; } // snap onto the vertex so joins never duplicate a coordinate
    if (t < 1e-9) t = 0;
    const a = points[i], b = points[Math.min(i + 1, last)];
    return { s: i + t, i, t, lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t };
  }
  function routeKmAt(points, s) {
    const p = routePosition(points, s);
    return distanceKm(points.slice(0, p.i + 1)) + (p.t ? distanceKm([points[p.i], p]) : 0);
  }
  // front = original points up to A (+ A), removed = A..B (preview), back = (B +) original points after B.
  // Original coordinates before A and after B are the same objects, untouched; only the joints A/B are new.
  function splitRouteForGap(points, sA, sB) {
    if (points.length < 2) return null;
    let A = routePosition(points, Math.min(sA, sB)), B = routePosition(points, Math.max(sA, sB));
    if (Math.abs(A.s - B.s) < 1e-9) return null;
    const joint = p => ({ lng: p.lng, lat: p.lat }); // plain point → shown as an edit point
    const front = A.t === 0 ? [...points.slice(0, A.i), joint(points[A.i])] : [...points.slice(0, A.i + 1), joint(A)];
    const back = B.t === 0 ? [joint(points[B.i]), ...points.slice(B.i + 1)] : [joint(B), ...points.slice(B.i + 1)];
    const removed = [joint(A), ...points.slice(A.i + 1, B.i + 1), joint(B)];
    return { A, B, front, back, removed };
  }
  function joinGapRoute(parts, connection) {
    return [...parts.front, ...connection.map(p => ({ lng: p.lng, lat: p.lat })), ...parts.back];
  }

  // ---- Gap cut from the elevation graph: graph x → route distance (m) → route position (same structure as map picks) ----
  // Profile distance is the cumulative horizontalMeters along the route, so it maps exactly onto routePosition's
  // fractional index even where the route overlaps itself (loops / out-and-back): distance order, not screen distance.
  function routeCumulativeMeters(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + horizontalMeters(points[i - 1], points[i]));
    return cum;
  }
  function routePositionAtDistance(points, cum, distance) {
    const last = points.length - 1, d = Math.max(0, Math.min(cum[last], distance));
    let lo = 0, hi = last - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }
    const length = cum[lo + 1] - cum[lo];
    return routePosition(points, lo + (length > 0 ? (d - cum[lo]) / length : 0));
  }
  function routeDistanceAtPosition(cum, pos) {
    const next = pos.i + 1 < cum.length ? cum[pos.i + 1] : cum[pos.i];
    return cum[pos.i] + pos.t * (next - cum[pos.i]);
  }
  // Click on the PC elevation graph while 구간 자르기 is waiting for A or B. Returns true when the click was consumed.
  function handleGapCutGraphClick(canvas, clientX) {
    if (!gapCut || canvas.id !== 'profileChart') return false;
    if (gapCut.phase !== 'pickA' && gapCut.phase !== 'pickB') return true; // preview/draw: map-side steps only
    if (profile.samples.length < 2 || !gapCut.cum) {
      toast(state.lang === 'ko' ? '그래프 계산이 끝난 뒤 선택해 주세요.' : 'Wait for the graph to finish loading.');
      return true;
    }
    const distance = snapDistanceToProfileView(profileDistanceAtClientX(canvas, clientX)); // same x→distance + view snap as normal clicks
    const pos = routePositionAtDistance(state.points, gapCut.cum, distance);
    if (gapCut.phase === 'pickA') {
      gapCut.A = pos;
      gapCut.candidates = []; gapCut.candidateFor = null; // a graph pick is unambiguous (no pass cycling)
      gapCut.phase = 'pickB';
    } else {
      gapCut.B = pos;
      if (gapCut.candidateFor !== 'A') { gapCut.candidates = []; gapCut.candidateFor = null; } // keep A's map passes (mixed pick)
      if (!updateGapCutPreview()) return true;
    }
    syncGapCutUi();
    render();
    return true;
  }
  // A (blue) / B (orange) vertical lines + markers, and the section to delete in red (preview phase, like the map).
  function drawGapCutOverlay(ctx, g) {
    const sess = gapCut || segPick;
    if (!sess?.cum || profile.samples.length < 2) return;
    const dA = sess.A ? routeDistanceAtPosition(sess.cum, sess.A) : null;
    const dB = sess.B ? routeDistanceAtPosition(sess.cum, sess.B) : null;
    if (sess.phase === 'preview' && dA !== null && dB !== null) {
      const lo = Math.min(dA, dB), hi = Math.max(dA, dB);
      const x1 = Math.max(0, g.xFor(lo)), x2 = Math.min(g.width, g.xFor(hi));
      if (x2 > x1) { ctx.fillStyle = 'rgba(239,68,68,.22)'; ctx.fillRect(x1, 0, x2 - x1, g.height); }
      const run = [profileSampleAt(lo), ...profile.samples.filter(sm => sm.distance > lo && sm.distance < hi), profileSampleAt(hi)].filter(Boolean);
      if (run.length > 1) {
        ctx.beginPath();
        run.forEach((sm, i) => { const x = g.xFor(sm.distance), y = g.yFor(sm.elevation); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      }
    }
    for (const [distance, color, label] of [[dA, '#38bdf8', 'A'], [dB, '#f59e0b', 'B']]) {
      if (distance === null) continue;
      const x = g.xFor(distance);
      if (x < -1 || x > g.width + 1) continue;
      const sample = profileSampleAt(distance);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, g.height); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      if (sample) {
        ctx.beginPath(); ctx.arc(x, g.yFor(sample.elevation), 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.font = '700 10px Manrope, sans-serif'; ctx.textBaseline = 'top';
      const left = x > g.width - 16; // keep the label inside the canvas
      ctx.fillStyle = color; ctx.fillRect(left ? x - 14 : x + 2, 2, 12, 13);
      ctx.fillStyle = '#0f172a'; ctx.textAlign = 'center'; ctx.fillText(label, (left ? x - 14 : x + 2) + 6, 3.5);
    }
  }

  // ---- PC graph-based editing (포인트 추가/선택, 코스 자르기, 구간 삭제) ----
  // The graph x axis is the cumulative horizontal distance of state.points, so a click maps to a route position
  // (fractional index) by distance order — overlapping/looping GPX tracks stay unambiguous. Elevation/slope are never edited.
  function graphPickPosition(canvas, clientX) {
    const wait = () => toast(state.lang === 'ko' ? '그래프 계산이 끝난 뒤 선택해 주세요.' : 'Wait for the graph to finish loading.');
    if (profile.samples.length < 2) { wait(); return null; }
    const cum = routeCumulativeMeters(state.points), total = cum[cum.length - 1];
    if (!(total > 0) || Math.abs(profile.samples[profile.samples.length - 1].distance - total) > Math.max(5, total * 0.02)) { wait(); return null; } // graph is stale vs. the route
    const distance = snapDistanceToProfileView(profileDistanceAtClientX(canvas, clientX));
    const range = profileViewRange(), plotWidth = Math.max(1, canvas.getBoundingClientRect().width - 16);
    return { cum, distance, pos: routePositionAtDistance(state.points, cum, distance), metersPerPx: (range.end - range.start) / plotWidth };
  }
  // Edit point at a route position: reuse an existing edit point, promote a shape coordinate, or insert on the segment.
  function insertEditPointAtPosition(pos) {
    const pts = state.points;
    if (pos.t === 0 && !pts[pos.i].shape) { state.selectedVertex = pos.i; render(); return pos.i; }
    pushHistory();
    let index;
    if (pos.t === 0) { index = pos.i; delete pts[index].shape; }
    else { index = pos.i + 1; pts.splice(index, 0, { lng: pos.lng, lat: pos.lat }); }
    state.selectedVertex = index;
    syncActiveCoursePoints(); renderCourseWorkList(); render();
    return index;
  }
  function syncVertexToGraph(i) { // map selection → graph cursor (same distance axis)
    if (!pcSparseEditing() || profile.samples.length < 2 || !Number.isInteger(i)) return;
    const cum = routeCumulativeMeters(state.points);
    if (Math.abs(profile.samples[profile.samples.length - 1].distance - cum[cum.length - 1]) > Math.max(5, cum[cum.length - 1] * 0.02)) return;
    selectProfileDistance(cum[i]);
  }
  function discardSplit() { if (!splitState) return; splitState.restore?.(); closeSplitHUD(); }
  function graphCutAt(pos) {
    const pts = state.points; let index = pos.t === 0 ? pos.i : pos.i + 1, restore = null;
    if (pos.t === 0 && (index <= 0 || index >= pts.length - 1)) { toast(state.lang === 'ko' ? '시작점이나 끝점은 나눌 수 없습니다. 중간 지점을 선택하세요.' : t('toastCourseCutNeedPoints')); return; }
    const hadShape = Boolean(pts[index].shape);
    pushHistory();
    let marker = pts[index];
    if (pos.t !== 0) { marker = { lng: pos.lng, lat: pos.lat }; pts.splice(index, 0, marker); }
    else delete marker.shape;
    restore = () => { // cancel: leave the route exactly as before (also drops the history entry created for the cut point)
      if (pts !== state.points || state.points[index] !== marker) return;
      if (pos.t !== 0) state.points.splice(index, 1); else if (hadShape) marker.shape = true;
      editHistory.past.pop(); updateUndoRedoUI();
    };
    splitState = { splitIndex: index, partA: pts.slice(0, index + 1), partB: pts.slice(index), restore };
    state.selectedVertex = index;
    syncActiveCoursePoints(); showSplitHUD(); render();
    toast(state.lang === 'ko' ? '경로가 구간 A(하늘색)와 구간 B(주황색)로 분할되었습니다. 삭제할 구간을 선택하세요.' : 'Route split into Segment A and B. Select a segment to delete.');
  }
  function segPickAccept(pos) { // shared by graph and map clicks
    const ko = state.lang === 'ko';
    if (!segPick) {
      segPick = { phase: 'pickB', A: pos, B: null, parts: null, cum: routeCumulativeMeters(state.points), n: state.points.length, first: state.points[0] };
    } else {
      const parts = splitRouteForGap(state.points, segPick.A.s, pos.s);
      if (!parts) { toast(ko ? 'A와 다른 위치를 B로 선택해 주세요.' : 'Pick B at a different position than A.'); return; }
      segPick.A = parts.A; segPick.B = parts.B; segPick.parts = parts; segPick.phase = 'preview'; // A before B in route order
    }
    state.selectedVertex = null;
    syncSegPickUi(); render();
  }
  function confirmSegPick() {
    if (!segPick?.parts) return;
    pushHistory();
    state.points = joinGapRoute(segPick.parts, []); // everything outside A..B is kept as is
    state.selectedVertex = null; segPick = null; state.segmentStart = null;
    syncSegPickUi(); syncActiveCoursePoints(); renderCourseWorkList(); render();
    toast(t('toastSegmentDeleted'));
  }
  function cancelSegPick(message = false) {
    if (!segPick) return;
    segPick = null; gapCutKeepProfileOnce = true;
    syncSegPickUi(); render();
    if (message) toast(state.lang === 'ko' ? '구간 삭제를 취소했습니다. 경로는 변경되지 않았습니다.' : 'Segment delete cancelled. Route unchanged.');
  }
  function syncSegPickUi() {
    const panel = $('#segDeletePanel'); if (!panel) return;
    panel.hidden = !segPick;
    $('#profileChart')?.classList.toggle('gap-cut-pick', Boolean(segPick) || (pcSparseEditing() && state.editorMode && ['edit', 'cut', 'delete-segment'].includes(state.tool)));
    if (!segPick) return;
    const ko = state.lang === 'ko', km = p => routeKmAt(state.points, p.s).toFixed(2) + ' km';
    const text = segPick.phase === 'pickB'
      ? (ko ? `삭제 구간의 끝 B를 지도 포인트 또는 그래프에서 선택하세요. (A: ${km(segPick.A)})` : `Pick end B on a map point or the graph. (A at ${km(segPick.A)})`)
      : (ko ? `빨간 구간(${km(segPick.A)} → ${km(segPick.B)})이 삭제됩니다. 확정하거나 B를 다시 선택하세요.` : `Red section (${km(segPick.A)} → ${km(segPick.B)}) will be deleted. Confirm or re-pick B.`);
    $('#segDeleteStatus').textContent = text;
    $('#segDeleteConfirmBtn').hidden = segPick.phase !== 'preview';
    const status = $('#editorStatus'); if (status) status.textContent = text;
  }
  function segPickLineFeatures() {
    if (!segPick?.parts) return [feature(state.points, true)];
    const { front, back, removed } = segPick.parts, out = [];
    if (front.length > 1) out.push(feature(front, true));
    out.push(feature(removed, true, '#ef4444', 'rgba(239,68,68,0.45)'));
    if (back.length > 1) out.push(feature(back, true));
    return out;
  }
  function segPickPointFeatures() {
    const pt = (p, color) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { i: -1, color, selected: true } });
    const out = [];
    if (segPick.A) out.push(pt(segPick.A, '#38bdf8'));
    if (segPick.B) out.push(pt(segPick.B, '#f59e0b'));
    return out;
  }
  // Graph click while a PC edit tool is active. Returns true when consumed (otherwise the normal graph lookup runs).
  function handleEditGraphClick(canvas, clientX) {
    if (gapCut || canvas.id !== 'profileChart' || !pcSparseEditing() || !state.editorMode) return false;
    const tool = state.tool;
    if (tool !== 'edit' && tool !== 'cut' && tool !== 'delete-segment') return false;
    if (state.points.length < 2) return false;
    const g = graphPickPosition(canvas, clientX);
    if (!g) return true;
    if (tool === 'edit') {
      let best = -1, gap = Infinity;
      g.cum.forEach((d, k) => { const diff = Math.abs(d - g.distance); if (isEditAnchor(state.points, k) && diff < gap) { gap = diff; best = k; } });
      if (best >= 0 && gap <= 9 * g.metersPerPx) { state.selectedVertex = best; render(); selectProfileDistance(g.cum[best]); toast(state.lang === 'ko' ? '편집 포인트를 선택했습니다. 지도에서 드래그해 이동하세요.' : 'Edit point selected. Drag it on the map.'); return true; }
      const index = insertEditPointAtPosition(g.pos);
      toast(state.lang === 'ko' ? '편집 포인트를 추가했습니다. 지도에서 드래그해 이동하세요.' : 'Edit point added. Drag it on the map.');
      const cum2 = routeCumulativeMeters(state.points); selectProfileDistance(cum2[index]);
      return true;
    }
    if (tool === 'cut') { discardSplit(); selectProfileDistance(g.distance); graphCutAt(g.pos); return true; }
    // delete-segment: a pending map-picked start becomes A
    if (!segPick && state.segmentStart !== null) { const startPos = routePosition(state.points, state.segmentStart); state.segmentStart = null; segPickAccept(startPos); }
    selectProfileDistance(g.distance);
    segPickAccept(g.pos);
    return true;
  }

  const projectRoutePoint = p => map.project([p.lng, p.lat]);
  function gapCutPick(which, candidates) {
    // B prefers a pass after A in route order unless another pass is clearly closer on screen.
    const ranked = candidates.map(c => ({ ...c, score: Math.sqrt(c.d2) + (which === 'B' && gapCut.A && c.s < gapCut.A.s ? 6 : 0) }))
      .sort((a, b) => a.score - b.score);
    gapCut.candidates = ranked;
    gapCut.candidateIndex = 0;
    gapCut.candidateFor = which;
    gapCut[which] = routePosition(state.points, ranked[0].s);
  }
  function startGapCut() {
    if (!pcSparseEditing()) return false;
    if (state.points.length < 2) { toast(t('toastNeedRouteFirst')); return false; }
    gapCut = { phase: 'pickA', A: null, B: null, parts: null, connection: [], candidates: [], candidateIndex: 0, candidateFor: null,
      cum: routeCumulativeMeters(state.points) }; // route is frozen during the session → cumulative distances stay valid for the graph
    state.selectedVertex = null;
    syncGapCutUi();
    render();
    return true;
  }
  function cancelGapCut(message = true) {
    if (!gapCut) return;
    gapCut = null; // nothing was applied yet → the route is exactly as before
    gapCutKeepProfileOnce = true; // the graph data is still valid: redraw without the DEM recalculation
    syncGapCutUi();
    render();
    if (message) toast(state.lang === 'ko' ? '구간 자르기를 취소했습니다. 경로는 변경되지 않았습니다.' : 'Section cut cancelled. Route unchanged.');
  }
  function handleGapCutClick(e) {
    if (gapCut.phase === 'pickA' || gapCut.phase === 'pickB') {
      const candidates = routeLineCandidates(state.points, e.point, projectRoutePoint);
      if (!candidates.length) { toast(state.lang === 'ko' ? '경로선 위를 클릭해 주세요.' : 'Click on the route line.'); return; }
      const which = gapCut.phase === 'pickA' ? 'A' : 'B';
      gapCutPick(which, candidates);
      if (which === 'A') gapCut.phase = 'pickB';
      else if (!updateGapCutPreview()) return;
    } else if (gapCut.phase === 'draw') {
      gapCut.connection.push({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
    syncGapCutUi();
    render();
  }
  function updateGapCutPreview() {
    const parts = splitRouteForGap(state.points, gapCut.A.s, gapCut.B.s);
    if (!parts) {
      gapCut.B = null; gapCut.phase = 'pickB';
      toast(state.lang === 'ko' ? 'A와 다른 위치를 B로 선택해 주세요.' : 'Pick B at a different position than A.');
      syncGapCutUi(); render();
      return false;
    }
    if (gapCut.B.s < gapCut.A.s) { // keep A before B in route order; the pass list follows the point it belongs to
      [gapCut.A, gapCut.B] = [gapCut.B, gapCut.A];
      if (gapCut.candidateFor) gapCut.candidateFor = gapCut.candidateFor === 'A' ? 'B' : 'A';
    }
    gapCut.parts = parts;
    gapCut.phase = 'preview';
    return true;
  }
  function cycleGapCutPass() {
    if (!gapCut || gapCut.candidates.length < 2) return;
    gapCut.candidateIndex = (gapCut.candidateIndex + 1) % gapCut.candidates.length;
    const pos = routePosition(state.points, gapCut.candidates[gapCut.candidateIndex].s);
    gapCut[gapCut.candidateFor] = pos;
    if (gapCut.phase === 'preview' && !updateGapCutPreview()) return;
    syncGapCutUi();
    render();
  }
  function finishGapCut() {
    if (!gapCut || gapCut.phase !== 'draw') return;
    const merged = joinGapRoute(gapCut.parts, gapCut.connection);
    pushHistory(); // snapshot of the untouched original → one 실행 취소 restores it; 다시 실행 re-applies
    state.points = merged;
    state.selectedVertex = null;
    syncActiveCoursePoints(); // marks the course dirty → must be saved again
    gapCut = null;
    syncGapCutUi();
    setEditorTool('edit');
    renderCourseWorkList();
    render(); // also reschedules the elevation/slope profile for the whole joined route (DEM sampled as before)
    toast(state.lang === 'ko' ? '구간을 연결했습니다. 저장하면 코스에 반영됩니다.' : 'Section joined. Save to keep it.');
  }
  function gapCutLineFeatures() {
    if (!gapCut?.parts) return [feature(state.points, true)];
    const { front, back, removed } = gapCut.parts;
    const out = [];
    if (front.length > 1) out.push(feature(front, true));
    if (gapCut.phase === 'preview') out.push(feature(removed, true, '#ef4444', 'rgba(239,68,68,0.45)'));
    else out.push(feature([front.at(-1), ...gapCut.connection, back[0]], true, '#facc15', 'rgba(250,204,21,0.45)'));
    if (back.length > 1) out.push(feature(back, true));
    return out;
  }
  function gapCutPointFeatures() {
    const pt = (p, color, selected = false) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { i: -1, color, selected } });
    const out = [];
    if (gapCut.A) out.push(pt(gapCut.A, '#38bdf8', true));
    if (gapCut.B) out.push(pt(gapCut.B, '#f59e0b', true));
    if (gapCut.phase === 'draw') gapCut.connection.forEach(p => out.push(pt(p, '#d8ff43')));
    return out;
  }
  function syncGapCutUi() {
    const panel = $('#gapCutPanel');
    if (!panel) return;
    panel.hidden = !gapCut;
    $('#profileChart')?.classList.toggle('gap-cut-pick', Boolean(gapCut && (gapCut.phase === 'pickA' || gapCut.phase === 'pickB')));
    if (!gapCut) return;
    const ko = state.lang === 'ko';
    const km = pos => pos ? routeKmAt(state.points, pos.s).toFixed(2) + ' km' : '';
    const passes = gapCut.candidates.length > 1 && gapCut.phase !== 'draw'
      ? (ko ? ` · 이 위치를 ${gapCut.candidates.length}번 통과합니다 (${gapCut.candidateIndex + 1}/${gapCut.candidates.length})` : ` · ${gapCut.candidates.length} passes here`) : '';
    const text = {
      pickA: ko ? '1단계: 경로선 위 또는 하단 그래프에서 자를 시작점 A를 클릭하세요.' : 'Step 1: click start cut point A on the route or the elevation graph.',
      pickB: ko ? `2단계: 지도 또는 그래프에서 종료점 B를 클릭하세요. (A: ${km(gapCut.A)} 지점${passes})` : `Step 2: click end cut point B on the map or graph. (A at ${km(gapCut.A)}${passes})`,
      preview: ko ? `빨간 구간(${km(gapCut.A)} → ${km(gapCut.B)})이 제거됩니다${passes}. 확인하면 제거합니다.` : `Red section (${km(gapCut.A)} → ${km(gapCut.B)}) will be removed${passes}.`,
      draw: ko ? `3단계: A(파랑)에서 B(주황)까지 지도를 클릭해 새 경로를 그리세요. 새 점 ${gapCut.connection.length}개` : `Step 3: click the map to draw from A (blue) to B (orange). ${gapCut.connection.length} new points`
    }[gapCut.phase];
    $('#gapCutStatus').textContent = text;
    $('#gapCutNextPassBtn').hidden = !(gapCut.candidates.length > 1 && gapCut.phase !== 'draw');
    $('#gapCutConfirmBtn').hidden = gapCut.phase !== 'preview';
    $('#gapCutUndoPointBtn').hidden = gapCut.phase !== 'draw';
    $('#gapCutUndoPointBtn').disabled = !gapCut.connection.length;
    $('#gapCutFinishBtn').hidden = gapCut.phase !== 'draw';
    const status = $('#editorStatus');
    if (status) status.textContent = text;
  }

  function render() {
    if (segPick && (segPick.n !== state.points.length || segPick.first !== state.points[0])) { segPick = null; syncSegPickUi(); } // route replaced (undo/redo/other edit)
    const routeSource = map.getSource('route'), pointSource = map.getSource('route-points');
    const lineFeatures = [];
    if (splitState && splitState.partA.length > 1 && splitState.partB.length > 1) {
      lineFeatures.push(feature(splitState.partA, true, '#38bdf8', 'rgba(56,189,248,0.5)'));
      lineFeatures.push(feature(splitState.partB, true, '#f59e0b', 'rgba(245,158,11,0.5)'));
    } else if (state.editorMode && state.courses.length) {
      for (const c of state.courses) {
        if (window.matchMedia('(max-width: 768px)').matches && c.id !== state.selectedCourseId) continue;
        if (gapCut && c.id === state.selectedCourseId) { lineFeatures.push(...gapCutLineFeatures()); continue; }
        if (segPick && c.id === state.selectedCourseId) { lineFeatures.push(...segPickLineFeatures()); continue; }
        if (c.points.length > 1) {
          lineFeatures.push(feature(c.points, c.id === state.selectedCourseId));
        }
      }
    } else if (state.points.length > 1) {
      lineFeatures.push(feature(state.points, true));
    }
    const routeCollection = { type: 'FeatureCollection', features: lineFeatures };
    pushNativeRoute(routeCollection);
    if (!routeSource || !pointSource) return;
    routeSource.setData(routeCollection);

    const showEditorPoints = state.editorMode && !(window.matchMedia('(max-width: 768px)').matches && mobileRoutePointsHidden);
    const pointFeatures = (showEditorPoints ? state.points : []).flatMap((p, i) => {
      if (!isEditAnchor(state.points, i)) return []; // PC GPX shape-only coordinate: line only, no marker
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
      return [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: props
      }];
    });
    // During 구간 자르기 only A, B and the newly drawn connection points are shown.
    pointSource.setData({ type: 'FeatureCollection', features: gapCut ? gapCutPointFeatures() : segPick ? segPickPointFeatures() : pointFeatures });

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
    renderGpsRecordingRoute();
    // 구간 자르기 session: the route is unchanged, so keep the graph data (A/B picks must not blank it or re-query DEM).
    const keepProfile = (gapCut || segPick || gapCutKeepProfileOnce) && profile.samples.length > 1;
    gapCutKeepProfileOnce = false;
    if (keepProfile) drawProfile(); else scheduleProfile();
  }

  function distanceKm(ps) { let d = 0; for (let i = 1; i < ps.length; i++) { const a = ps[i - 1], b = ps[i], r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; d += 6371 * Math.sqrt(x * x + y * y) } return d }
  function horizontalMeters(a, b) { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return 6371000 * Math.sqrt(x * x + y * y) }

  function gpsStorageKey(prefix, userId) {
    return `${prefix}${userId}`;
  }

  function createRouteUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (!bytes.some(Boolean)) for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  function getPendingGpsRoutes(userId = state.session?.user?.id) {
    if (!userId) return [];
    try {
      const routes = JSON.parse(localStorage.getItem(gpsStorageKey(GPS_PENDING_ROUTES_PREFIX, userId)) || '[]');
      return Array.isArray(routes) ? routes.filter(route => route?.recordingOwnerId === userId && route?.id && Array.isArray(route.points)) : [];
    } catch {
      return [];
    }
  }

  function savePendingGpsRoutes(userId, routes) {
    if (!userId) return;
    localStorage.setItem(gpsStorageKey(GPS_PENDING_ROUTES_PREFIX, userId), JSON.stringify(routes));
  }

  function mergePendingGpsRoutes(cloudRoutes, userId) {
    const cloudIds = new Set(cloudRoutes.map(route => route.id));
    const pendingRoutes = getPendingGpsRoutes(userId);
    const remaining = pendingRoutes.filter(route => !cloudIds.has(route.id));
    if (remaining.length !== pendingRoutes.length) savePendingGpsRoutes(userId, remaining);
    return [...remaining, ...cloudRoutes];
  }

  function getGpsRecordingElapsedMs() {
    return gpsRecording.elapsedBeforePauseMs + (gpsRecording.status === 'recording' && gpsRecording.lastResumedAt
      ? Math.max(0, Date.now() - gpsRecording.lastResumedAt)
      : 0);
  }

  function formatGpsElapsed(milliseconds) {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [hours, minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
  }

  function persistGpsRecording() {
    if (gpsRecordingPersistTimer !== null) {
      clearTimeout(gpsRecordingPersistTimer);
      gpsRecordingPersistTimer = null;
    }
    if (!gpsRecording.ownerId || gpsRecording.status === 'idle') return;
    const startedAt = performance.now();
    gpsRecordingLastPersistAt = Date.now();
    try {
      localStorage.setItem(gpsStorageKey(GPS_RECORDING_STORAGE_PREFIX, gpsRecording.ownerId), JSON.stringify({
        version: 1,
        id: gpsRecording.id,
        ownerId: gpsRecording.ownerId,
        status: gpsRecording.status,
        points: gpsRecording.points,
        region: gpsRecording.region,
        startedAt: gpsRecording.startedAt,
        elapsedBeforePauseMs: gpsRecording.elapsedBeforePauseMs,
        lastResumedAt: gpsRecording.lastResumedAt,
        lastError: gpsRecording.lastError
      }));
    } catch (error) {
      gpsRecording.lastError = '로컬 저장 공간이 부족합니다.';
      console.warn('GPS recording persistence failed:', error);
    } finally {
      logGpsPerformance('active recording persist', startedAt);
    }
  }

  function clearPersistedGpsRecording(userId = gpsRecording.ownerId) {
    if (userId) localStorage.removeItem(gpsStorageKey(GPS_RECORDING_STORAGE_PREFIX, userId));
  }

  function scheduleGpsRecordingPersist() {
    if (gpsRecordingPersistTimer !== null) return;
    const elapsed = Date.now() - gpsRecordingLastPersistAt;
    if (elapsed >= GPS_PERSIST_INTERVAL_MS) {
      persistGpsRecording();
      return;
    }
    gpsRecordingPersistTimer = setTimeout(() => {
      gpsRecordingPersistTimer = null;
      persistGpsRecording();
    }, GPS_PERSIST_INTERVAL_MS - elapsed);
  }

  function resetGpsRecordingState() {
    clearTimeout(gpsRecordingPersistTimer);
    gpsRecordingPersistTimer = null;
    clearTimeout(gpsRecordingMapTimer);
    gpsRecordingMapTimer = null;
    gpsRecordingMapDirty = false;
    gpsRecordingLastPersistAt = 0;
    gpsRecordingDistanceKmValue = 0;
    gpsRecordingAction = '';
    Object.assign(gpsRecording, {
      id: '', ownerId: '', status: 'idle', points: [], region: '', startedAt: null,
      elapsedBeforePauseMs: 0, lastResumedAt: null, watcherId: null, webWatcherId: null,
      lastError: ''
    });
    const finishModal = $('#gpsRecordingFinishModal');
    if (finishModal) finishModal.hidden = true;
    renderGpsRecordingRoute();
    updateGpsRecordingUi();
  }

  function renderGpsRecordingRoute() {
    const startedAt = performance.now();
    gpsRecordingLastMapRenderAt = startedAt;
    const coordinates = gpsRecording.points.map(point => [point.lng, point.lat]);
    // Offline (Native) map: same recorded points, same look (#38bdf8 line + glow). Sent before the web-source check,
    // because offline the web style may never load and then the web source does not exist.
    pushNativeGpsRoute(coordinates);
    const source = typeof map?.getSource === 'function' ? map.getSource('gps-recording-route') : null;
    if (!source) return;
    source.setData(coordinates.length > 1 ? {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }]
    } : emptyCollection);
    logGpsPerformance('route setData', startedAt);
  }

  function scheduleGpsRecordingRouteRender() {
    gpsRecordingMapDirty = true;
    if (gpsRecordingMapTimer !== null) return;
    const elapsed = performance.now() - gpsRecordingLastMapRenderAt;
    const delay = Math.max(0, GPS_ROUTE_RENDER_INTERVAL_MS - elapsed);
    gpsRecordingMapTimer = setTimeout(() => {
      gpsRecordingMapTimer = null;
      if (!gpsRecordingMapDirty) return;
      gpsRecordingMapDirty = false;
      renderGpsRecordingRoute();
    }, delay);
  }

  function updateGpsRecordingUi() {
    const active = gpsRecording.status === 'recording' || gpsRecording.status === 'paused' || Boolean(gpsRecordingAction);
    const recording = gpsRecording.status === 'recording';
    const panel = $('#gpsRecordingPanel');
    if (panel) {
      panel.hidden = !active;
      panel.classList.toggle('paused', gpsRecording.status === 'paused');
    }
    const mainButton = $('#rideShareBtn');
    if (mainButton) mainButton.hidden = active;
    mainButton?.classList.toggle('recording', recording);
    mainButton?.classList.toggle('paused', gpsRecording.status === 'paused');
    const label = $('#rideRecordBtnLabel');
    const labelText = recording ? '경로 기록 중' : gpsRecording.status === 'paused' ? '기록 일시정지' : '내 경로 기록';
    if (label && label.textContent !== labelText) label.textContent = labelText;
    const status = $('#gpsRecordingStatus');
    const statusText = gpsRecordingAction === 'starting' ? '시작 중…'
      : gpsRecordingAction === 'pausing' ? '일시정지 중…'
        : gpsRecordingAction === 'resuming' ? '재개 중…'
          : recording ? '기록 중' : gpsRecording.status === 'paused' ? '일시정지' : '기록 준비';
    if (status && status.textContent !== statusText) status.textContent = statusText;
    const signal = $('#gpsRecordingSignal');
    const signalText = gpsRecording.lastError || (gpsRecording.points.length ? 'GPS 정상' : 'GPS 신호 대기');
    if (signal && signal.textContent !== signalText) signal.textContent = signalText;
    const distance = $('#gpsRecordingDistance');
    const distanceText = `${gpsRecordingDistanceKmValue.toFixed(2)} km`;
    if (distance && distance.textContent !== distanceText) distance.textContent = distanceText;
    const elapsed = $('#gpsRecordingElapsed');
    const elapsedText = formatGpsElapsed(getGpsRecordingElapsedMs());
    if (elapsed && elapsed.textContent !== elapsedText) elapsed.textContent = elapsedText;
    const count = $('#gpsRecordingPointCount');
    const countText = `${gpsRecording.points.length}pt`;
    if (count && count.textContent !== countText) count.textContent = countText;
    const pauseButton = $('#gpsRecordPauseBtn');
    if (pauseButton) {
      pauseButton.setAttribute('aria-busy', String(Boolean(gpsRecordingAction)));
      pauseButton.classList.toggle('busy', Boolean(gpsRecordingAction));
      const pauseButtonText = gpsRecordingAction ? '처리 중…' : recording ? '기록 일시정지' : '기록 재개';
      if (pauseButton.textContent !== pauseButtonText) pauseButton.textContent = pauseButtonText;
    }
  }

  function ensureGpsProcessingIndicators() {
    const ensureIndicator = (id, targetSelector) => {
      let indicator = document.getElementById(id);
      if (indicator) return indicator;
      const target = document.querySelector(targetSelector);
      if (!target) return null;
      indicator = document.createElement('div');
      indicator.id = id;
      indicator.className = 'gps-recording-processing';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-live', 'polite');
      indicator.hidden = true;
      indicator.innerHTML = '<span class="gps-recording-processing-spinner" aria-hidden="true"></span><span>처리 중…</span>';
      target.insertAdjacentElement('beforebegin', indicator);
      return indicator;
    };
    ensureIndicator('gpsRecordingPanelProcessing', '#gpsRecordingPanel .gps-recording-actions');
    ensureIndicator('gpsRecordingModalProcessing', '#gpsRecordingFinishModal .gps-recording-finish-actions');
  }

  function beginGpsProcessing(area) {
    ensureGpsProcessingIndicators();
    gpsProcessingCounts[area] += 1;
    const indicator = area === 'modal' ? $('#gpsRecordingModalProcessing') : $('#gpsRecordingPanelProcessing');
    if (indicator) indicator.hidden = false;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      gpsProcessingCounts[area] = Math.max(0, gpsProcessingCounts[area] - 1);
      if (indicator && gpsProcessingCounts[area] === 0) indicator.hidden = true;
    };
  }

  function waitForGpsUiPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  // ---- GPS recording fix filter. Pure decision logic (no DOM/map); state = one pending jump candidate. ----
  // evaluate() returns { points: [fixes to append, in time order], verdict: 'accept'|'reject'|'hold', reason, distance, speed }.
  function createGpsFixFilter() {
    let candidate = null;
    const dist = (p, q) => horizontalMeters(p, q);
    // 'ok' | 'jump' | 'near' for a fix measured against the last accepted point (accuracy-aware, no interpolation).
    function judge(prev, fix) {
      const dt = (fix.timeMs - prev.timeMs) / 1000;
      const d = dist(prev, fix);
      const effective = Math.max(0, d - (Number(prev.accuracy) + fix.accuracy) * 0.5);
      const speed = dt > 0 ? effective / dt : Infinity;
      const nearLimit = Math.min(8, Math.max(GPS_MIN_POINT_DISTANCE_METERS, fix.accuracy * 0.4));
      if (speed > GPS_MAX_SPEED_METERS_PER_SECOND) return { kind: 'jump', d, speed };
      if (d < nearLimit) return { kind: 'near', d, speed: dt > 0 ? d / dt : 0 };
      return { kind: 'ok', d, speed: dt > 0 ? d / dt : 0 };
    }
    return {
      reset() { candidate = null; },
      evaluate(fix, ctx) {
        const { previous, receivedAt, resumeAt, startedAtMs } = ctx;
        const out = (verdict, reason, extra = {}) => ({ points: [], verdict, reason, distance: 0, speed: 0, ...extra });
        if (fix.timeMs > receivedAt + 5000) return out('reject', 'future_time');
        const age = receivedAt - fix.timeMs;
        if (previous) {
          if (fix.timeMs <= previous.timeMs) return out('reject', 'out_of_order');
          if (age > GPS_MAX_BACKLOG_AGE_MS) return out('reject', 'too_old');
        } else if (age > GPS_FIRST_FIX_MAX_AGE_MS) return out('reject', 'stale_first_fix');
        // Screen just came back: fixes measured in the guard window must be accurate (backlog measured earlier is not affected).
        if (resumeAt && fix.timeMs >= resumeAt - 2000 && fix.timeMs <= resumeAt + GPS_RESUME_GUARD_MS && fix.accuracy > GPS_RESUME_MAX_ACCURACY_METERS) return out('reject', 'resume_low_accuracy');
        if (!Number.isFinite(fix.accuracy) || fix.accuracy > GPS_FALLBACK_ACCURACY_METERS) return out('reject', 'low_accuracy');
        const fallback = fix.accuracy > GPS_MAX_ACCURACY_METERS;
        if (fallback) {
          const gapMs = previous ? fix.timeMs - previous.timeMs : receivedAt - startedAtMs;
          if (gapMs < (previous ? GPS_FALLBACK_MIN_GAP_MS : 30000)) return out('reject', 'low_accuracy');
        }
        if (!previous) return { points: [fix], verdict: 'accept', reason: fallback ? 'first_fallback' : 'first', distance: 0, speed: 0 };
        if (candidate && fix.timeMs - candidate.timeMs > GPS_CANDIDATE_TTL_MS) candidate = null;
        const verdict = judge(previous, fix);
        if (verdict.kind === 'ok' || verdict.kind === 'near') {
          if (candidate) candidate = null; // the track continued normally: the earlier jump was an outlier
          if (verdict.kind === 'near') return out('reject', 'too_close', { distance: verdict.d, speed: verdict.speed });
          return { points: [fix], verdict: 'accept', reason: fallback ? 'ok_fallback' : 'ok', distance: verdict.d, speed: verdict.speed };
        }
        // Jump: never append directly. Needs a second fix that agrees with it.
        if (fallback) return out('reject', 'jump_low_accuracy', { distance: verdict.d, speed: verdict.speed });
        if (candidate) {
          const agree = judge(candidate, fix);
          if (agree.kind !== 'jump') {
            const confirmed = candidate; candidate = null;
            const rest = judge(confirmed, fix);
            const points = rest.kind === 'ok' ? [confirmed, fix] : [confirmed];
            return { points, verdict: 'accept', reason: 'jump_confirmed', distance: verdict.d, speed: verdict.speed };
          }
        }
        candidate = fix;
        return out('hold', 'jump_candidate', { distance: verdict.d, speed: verdict.speed });
      }
    };
  }
  const gpsFixFilter = createGpsFixFilter();
  let gpsRecordingResumeAt = 0;
  const gpsDiagLines = [];
  // Diagnostics: one short line per fix (measured time, receive delay, accuracy, distance, verdict/reason).
  function logGpsDiag(fix, receivedAt, result) {
    const line = `[GPS] ${result.verdict}:${result.reason} t=${new Date(fix.timeMs).toISOString().slice(11, 23)} recv=${((receivedAt - fix.timeMs) / 1000).toFixed(1)}s acc=${Number.isFinite(fix.accuracy) ? Math.round(fix.accuracy) : '?'}m d=${Math.round(result.distance || 0)}m v=${Number.isFinite(result.speed) ? result.speed.toFixed(1) : 'inf'}m/s`;
    gpsDiagLines.push(line);
    if (gpsDiagLines.length > GPS_DIAG_MAX_LINES) gpsDiagLines.shift();
    console.debug(line);
  }
  window.powderlineGpsDiag = () => gpsDiagLines.slice();

  function acceptGpsRecordingLocation(location) {
    if (gpsRecording.status !== 'recording' || !location || location.simulated === true) return;
    const lat = Number(location.latitude ?? location.coords?.latitude);
    const lng = Number(location.longitude ?? location.coords?.longitude);
    const accuracy = Number(location.accuracy ?? location.coords?.accuracy);
    const rawTime = Number(location.time ?? location.timestamp ?? Date.now());
    const receivedAt = Date.now();
    const time = Number.isFinite(rawTime) ? rawTime : receivedAt; // measurement time is kept as-is (never replaced by receive time when present)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    const altitude = Number.isFinite(Number(location.altitude ?? location.coords?.altitude)) ? Number(location.altitude ?? location.coords?.altitude) : null;
    const fix = { lng, lat, elevation: altitude, altitude, time: new Date(time).toISOString(), timeMs: time, accuracy };
    const previous = gpsRecording.points.at(-1);
    const previousTimed = previous ? { ...previous, timeMs: new Date(previous.time).getTime() } : null;
    const result = gpsFixFilter.evaluate(fix, { previous: previousTimed, receivedAt, resumeAt: gpsRecordingResumeAt, startedAtMs: new Date(gpsRecording.startedAt || receivedAt).getTime() });
    logGpsDiag(fix, receivedAt, result);
    if (!result.points.length) {
      if (result.reason === 'low_accuracy' || result.reason === 'resume_low_accuracy') {
        gpsRecording.lastError = Number.isFinite(accuracy) ? `GPS 정확도 낮음 (${Math.round(accuracy)}m)` : 'GPS 정확도 확인 중';
        updateGpsRecordingUi();
      } else if (result.reason === 'jump_candidate' || result.reason === 'jump_low_accuracy') {
        gpsRecording.lastError = '비정상적인 GPS 이동값을 제외했습니다.';
        updateGpsRecordingUi();
      }
      return;
    }
    for (const accepted of result.points) {
      const last = gpsRecording.points.at(-1);
      const { timeMs, ...point } = accepted;
      if (last) gpsRecordingDistanceKmValue += horizontalMeters(last, point) / 1000;
      gpsRecording.points.push(point);
    }
    gpsRecording.lastError = '';
    scheduleGpsRecordingPersist();
    scheduleGpsRecordingRouteRender();
  }

  function getBackgroundGeolocationPlugin() {
    if (backgroundGeolocationPlugin) return backgroundGeolocationPlugin;
    const capacitor = window.Capacitor;
    if (capacitor?.getPlatform?.() !== 'android') return null;
    backgroundGeolocationPlugin = capacitor.registerPlugin
      ? capacitor.registerPlugin('BackgroundGeolocation')
      : capacitor.Plugins?.BackgroundGeolocation || null;
    return backgroundGeolocationPlugin;
  }

  async function ensureAndroidNotificationPermission() {
    const capacitor = window.Capacitor;
    if (capacitor?.getPlatform?.() !== 'android') return;
    localNotificationsPlugin ||= capacitor.registerPlugin
      ? capacitor.registerPlugin('LocalNotifications')
      : capacitor.Plugins?.LocalNotifications || null;
    if (!localNotificationsPlugin?.checkPermissions || !localNotificationsPlugin?.requestPermissions) {
      throw new Error('알림 권한 플러그인을 사용할 수 없습니다.');
    }
    let permission = await localNotificationsPlugin.checkPermissions();
    if (permission?.display !== 'granted') permission = await localNotificationsPlugin.requestPermissions();
    if (permission?.display !== 'granted') throw new Error('백그라운드 기록 알림 권한이 필요합니다.');
  }

  async function stopGpsRecordingWatcher() {
    const generation = ++gpsRecording.watcherGeneration;
    const watcherId = gpsRecording.watcherId;
    const webWatcherId = gpsRecording.webWatcherId;
    gpsRecording.watcherId = null;
    gpsRecording.webWatcherId = null;
    if (watcherId !== null) {
      try { await getBackgroundGeolocationPlugin()?.removeWatcher?.({ id: watcherId }); } catch (error) { console.warn('Background GPS watcher cleanup failed:', error); }
    }
    if (webWatcherId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(webWatcherId); } catch {}
    }
    return generation;
  }

  async function handleGpsRecordingError(error) {
    const unauthorized = error?.code === 'NOT_AUTHORIZED' || error?.code === 1 || /permission|authoriz|denied/i.test(String(error?.message || error || ''));
    gpsRecording.lastError = unauthorized ? '위치 권한이 필요합니다.' : (error?.message || 'GPS 신호를 받을 수 없습니다.');
    if (unauthorized && gpsRecording.status === 'recording' && !gpsRecordingAction) {
      gpsRecording.elapsedBeforePauseMs = getGpsRecordingElapsedMs();
      gpsRecording.lastResumedAt = null;
      gpsRecording.status = 'paused';
      await stopGpsRecordingWatcher();
      persistGpsRecording();
    }
    updateGpsRecordingUi();
  }

  // Shows my location (blue dot/heading arrow) and drives auto-follow from recording fixes. Does not touch the recording filter.
  function feedMyLocationFromRecording(location) {
    if (!location || location.simulated === true) return;
    const lat = Number(location.latitude ?? location.coords?.latitude);
    const lng = Number(location.longitude ?? location.coords?.longitude);
    const accuracy = Number(location.accuracy ?? location.coords?.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(accuracy <= GPS_FALLBACK_ACCURACY_METERS)) return;
    const time = Number(location.time ?? location.timestamp);
    try { syncMyLocationBlueDotFromFix({ latitude: lat, longitude: lng, accuracy, heading: null, speed: null }, Number.isFinite(time) ? time : Date.now()); } catch {}
  }

  async function startGpsRecordingWatcher() {
    await stopGpsRecordingWatcher();
    gpsFixFilter.reset();
    const generation = gpsRecording.watcherGeneration;
    if (window.Capacitor?.getPlatform?.() === 'android') {
      await ensureAndroidNotificationPermission();
      const plugin = getBackgroundGeolocationPlugin();
      if (!plugin?.addWatcher) throw new Error('백그라운드 GPS 플러그인을 사용할 수 없습니다.');
      const watcherId = await plugin.addWatcher({
        backgroundTitle: 'POWDERLINE 경로 기록 중',
        backgroundMessage: '화면이 꺼져도 GPS 이동 경로를 기록하고 있습니다.',
        requestPermissions: true,
        stale: false,
        distanceFilter: GPS_MIN_POINT_DISTANCE_METERS
      }, (location, error) => {
        if (error) void handleGpsRecordingError(error);
        else { feedMyLocationFromRecording(location); acceptGpsRecordingLocation(location); }
      });
      const watcherStartPending = gpsRecordingAction === 'starting' || gpsRecordingAction === 'resuming';
      if (generation !== gpsRecording.watcherGeneration || (gpsRecording.status !== 'recording' && !watcherStartPending)) {
        await plugin.removeWatcher({ id: watcherId });
        return;
      }
      gpsRecording.watcherId = watcherId;
      return;
    }
    if (!navigator.geolocation) throw new Error('이 브라우저에서는 GPS를 사용할 수 없습니다.');
    gpsRecording.webWatcherId = navigator.geolocation.watchPosition(
      position => { feedMyLocationFromRecording(position); acceptGpsRecordingLocation(position); },
      error => { void handleGpsRecordingError(error); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }

  async function startGpsRecording() {
    if (gpsRecordingAction) return toast('GPS 요청을 처리 중입니다. 잠시만 기다려 주세요.');
    if (gpsRecording.status !== 'idle') return;
    const ownerId = state.session?.user?.id;
    if (!ownerId) return toast('승인된 계정 확인 후 경로를 기록할 수 있습니다.');
    gpsRecordingAction = 'starting';
    const finishTransition = beginGpsWatcherTransition();
    const finishProcessing = beginGpsProcessing('panel');
    const transitionStartedAt = performance.now();
    Object.assign(gpsRecording, {
      id: createRouteUuid(), ownerId, status: 'idle', points: [], region: $('#region')?.value || 'furano',
      startedAt: new Date().toISOString(), elapsedBeforePauseMs: 0, lastResumedAt: null, lastError: ''
    });
    gpsRecordingDistanceKmValue = 0;
    updateGpsRecordingUi();
    try {
      await waitForGpsUiPaint();
      await startGpsRecordingWatcher();
      if (gpsRecordingAction !== 'starting') return;
      gpsRecording.status = 'recording';
      armMyLocationFollow();
      gpsRecording.lastResumedAt = Date.now();
      persistGpsRecording();
      toast(window.Capacitor?.getPlatform?.() === 'android' ? '백그라운드 GPS 경로 기록을 시작했습니다.' : '웹 포그라운드 GPS 기록을 시작했습니다.');
    } catch (error) {
      const message = error?.message || 'GPS 기록을 시작하지 못했습니다.';
      gpsRecording.lastError = message;
      await stopGpsRecordingWatcher();
      resetGpsRecordingState();
      toast(message);
    } finally {
      if (gpsRecordingAction === 'starting') gpsRecordingAction = '';
      finishTransition();
      finishProcessing();
      updateGpsRecordingUi();
      logGpsPerformance('watcher start transition', transitionStartedAt);
    }
  }

  async function pauseGpsRecording() {
    if (gpsRecordingAction) return toast('GPS 요청을 처리 중입니다. 잠시만 기다려 주세요.');
    if (gpsRecording.status !== 'recording') return;
    gpsRecordingAction = 'pausing';
    const finishTransition = beginGpsWatcherTransition();
    const finishProcessing = beginGpsProcessing('panel');
    const transitionStartedAt = performance.now();
    updateGpsRecordingUi();
    try {
      await waitForGpsUiPaint();
      await stopGpsRecordingWatcher();
      if (gpsRecordingAction !== 'pausing' || gpsRecording.status !== 'recording') return;
      gpsRecording.elapsedBeforePauseMs = getGpsRecordingElapsedMs();
      gpsRecording.lastResumedAt = null;
      gpsRecording.status = 'paused';
      persistGpsRecording();
      toast('경로 기록을 일시정지했습니다.');
    } catch (error) {
      gpsRecording.lastError = error?.message || 'GPS 일시정지를 완료하지 못했습니다.';
      persistGpsRecording();
      toast(gpsRecording.lastError);
    } finally {
      if (gpsRecordingAction === 'pausing') gpsRecordingAction = '';
      finishTransition();
      finishProcessing();
      updateGpsRecordingUi();
      logGpsPerformance('watcher pause transition', transitionStartedAt);
    }
  }

  async function resumeGpsRecording() {
    if (gpsRecordingAction) return toast('GPS 요청을 처리 중입니다. 잠시만 기다려 주세요.');
    if (gpsRecording.status !== 'paused') return;
    gpsRecordingAction = 'resuming';
    const finishTransition = beginGpsWatcherTransition();
    const finishProcessing = beginGpsProcessing('panel');
    const transitionStartedAt = performance.now();
    updateGpsRecordingUi();
    try {
      await waitForGpsUiPaint();
      await startGpsRecordingWatcher();
      if (gpsRecordingAction !== 'resuming' || gpsRecording.status !== 'paused') return;
      gpsRecording.status = 'recording';
      armMyLocationFollow();
      gpsRecording.lastResumedAt = Date.now();
      gpsRecording.lastError = '';
      persistGpsRecording();
      toast('경로 기록을 재개했습니다.');
    } catch (error) {
      gpsRecording.lastError = error?.message || 'GPS 기록을 재개하지 못했습니다.';
      persistGpsRecording();
      toast(gpsRecording.lastError);
    } finally {
      if (gpsRecordingAction === 'resuming') gpsRecordingAction = '';
      finishTransition();
      finishProcessing();
      updateGpsRecordingUi();
      logGpsPerformance('watcher resume transition', transitionStartedAt);
    }
  }

  function gpsRecordingDefaultName() {
    return `GPS 기록 ${new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
  }

  async function finishGpsRecording() {
    if (!['recording', 'paused'].includes(gpsRecording.status)) return;
    if (gpsFinishModalOpening) return toast('종료 화면을 여는 중입니다. 잠시만 기다려 주세요.');
    gpsFinishModalOpening = true;
    const finishProcessing = beginGpsProcessing('panel');
    const modal = $('#gpsRecordingFinishModal');
    const nameInput = $('#gpsRecordingCourseName');
    const summary = $('#gpsRecordingFinishSummary');
    try {
      await waitForGpsUiPaint();
      if (!modal || !nameInput) return;
      nameInput.value = gpsRecordingDefaultName();
      if (summary) {
        summary.textContent = `${distanceKm(gpsRecording.points).toFixed(2)} km · ${formatGpsElapsed(getGpsRecordingElapsedMs())} · ${gpsRecording.points.length}pt 기록을 저장하시겠습니까?`;
      }
      modal.hidden = false;
      requestAnimationFrame(() => {
        nameInput.focus();
        nameInput.select();
      });
    } finally {
      gpsFinishModalOpening = false;
      finishProcessing();
    }
  }

  async function saveFinishedGpsRecording() {
    if (!['recording', 'paused'].includes(gpsRecording.status)) return;
    const saveButton = $('#gpsRecordingSaveBtn');
    const discardButton = $('#gpsRecordingDiscardBtn');
    const nameInput = $('#gpsRecordingCourseName');
    const name = nameInput?.value.trim().slice(0, 80) || gpsRecordingDefaultName();
    if (saveButton) saveButton.disabled = true;
    if (discardButton) discardButton.disabled = true;
    const saveLabel = saveButton?.textContent || '저장';
    if (saveButton) saveButton.textContent = '저장 중…';
    const finishProcessing = beginGpsProcessing('modal');
    try {
      await waitForGpsUiPaint();
      await waitForGpsWatcherTransition();
      const ownerId = gpsRecording.ownerId;
      const points = gpsRecording.points.map(point => ({ ...point }));
      const savedRoute = {
        id: gpsRecording.id,
        name,
        region: gpsRecording.region,
        km: distanceKm(points),
        points,
        createdAt: gpsRecording.startedAt,
        updatedAt: new Date().toISOString(),
        source: 'local',
        syncStatus: 'pending',
        recordingOwnerId: ownerId
      };
      const pendingRoutes = getPendingGpsRoutes(ownerId).filter(route => route.id !== savedRoute.id);
      savePendingGpsRoutes(ownerId, [savedRoute, ...pendingRoutes]);
      await stopGpsRecordingWatcher();
      try { clearPersistedGpsRecording(ownerId); } catch (error) { console.warn('GPS active recording cleanup failed:', error); }
      resetGpsRecordingState();
      state.saved = [savedRoute, ...state.saved.filter(route => route.id !== savedRoute.id)];
      renderSaved();
      toast(onlineAuthVerified ? '내 코스에 저장했습니다. 서버 동기화를 시작합니다.' : '내 코스에 저장했습니다. 온라인 복구 시 동기화됩니다.');
      void syncPendingGpsRoutes();
    } catch (error) {
      console.warn('GPS recording save failed:', error);
      toast('기록을 로컬에 저장하지 못했습니다. 다시 시도하세요.');
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = saveLabel;
      }
      if (discardButton) discardButton.disabled = false;
      finishProcessing();
    }
  }

  async function discardFinishedGpsRecording() {
    if (!['recording', 'paused'].includes(gpsRecording.status)) return;
    const saveButton = $('#gpsRecordingSaveBtn');
    const discardButton = $('#gpsRecordingDiscardBtn');
    if (saveButton) saveButton.disabled = true;
    if (discardButton) discardButton.disabled = true;
    const discardLabel = discardButton?.textContent || '저장 안 함';
    if (discardButton) discardButton.textContent = '종료 중…';
    const finishProcessing = beginGpsProcessing('modal');
    try {
      await waitForGpsUiPaint();
      await waitForGpsWatcherTransition();
      const ownerId = gpsRecording.ownerId;
      await stopGpsRecordingWatcher();
      try { clearPersistedGpsRecording(ownerId); } catch (error) { console.warn('GPS discarded recording cleanup failed:', error); }
      resetGpsRecordingState();
      toast('GPS 경로 기록을 저장하지 않고 종료했습니다.');
    } catch (error) {
      console.warn('GPS recording discard failed:', error);
      toast('기록 종료를 완료하지 못했습니다. 다시 시도하세요.');
    } finally {
      if (saveButton) saveButton.disabled = false;
      if (discardButton) {
        discardButton.disabled = false;
        discardButton.textContent = discardLabel;
      }
      finishProcessing();
    }
  }

  async function syncPendingGpsRoutes() {
    const client = supabaseClient;
    const userId = state.session?.user?.id;
    if (gpsPendingSyncRunning || !client || !userId || !onlineAuthVerified || state.profile?.status !== 'approved') return;
    gpsPendingSyncRunning = true;
    try {
      let pendingRoutes = getPendingGpsRoutes(userId);
      for (const route of [...pendingRoutes]) {
        const payload = {
          id: route.id,
          user_id: userId,
          name: route.name,
          region: route.region,
          points: route.points,
          distance_km: route.km,
          updated_at: route.updatedAt || new Date().toISOString()
        };
        let response;
        try {
          response = await withTimeout(
            client.from('powderline_routes').insert(payload).select('id,name,region,points,distance_km,created_at,updated_at').single(),
            INITIAL_AUTH_TIMEOUT_MS,
            'GPS route sync timed out.'
          );
          if (response.error?.code === '23505') {
            response = await withTimeout(
              client.from('powderline_routes').select('id,name,region,points,distance_km,created_at,updated_at').eq('id', route.id).eq('user_id', userId).single(),
              INITIAL_AUTH_TIMEOUT_MS,
              'GPS route verification timed out.'
            );
          }
        } catch (error) {
          console.warn('GPS route sync deferred:', error);
          break;
        }
        if (response?.error || !response?.data) {
          console.warn('GPS route sync deferred:', response?.error);
          break;
        }
        const row = response.data;
        const cloudRoute = {
          id: row.id, name: row.name, region: row.region,
          points: Array.isArray(row.points) ? row.points.map(point => ({ ...point, lng: Number(point.lng), lat: Number(point.lat) })) : route.points,
          km: Number(row.distance_km) || route.km,
          createdAt: row.created_at, updatedAt: row.updated_at, source: 'cloud'
        };
        pendingRoutes = pendingRoutes.filter(item => item.id !== route.id);
        savePendingGpsRoutes(userId, pendingRoutes);
        state.saved = [cloudRoute, ...state.saved.filter(item => item.id !== route.id)];
      }
      renderSaved();
    } finally {
      gpsPendingSyncRunning = false;
    }
  }

  async function restoreGpsRecording() {
    if (gpsRecording.initialized) return;
    gpsRecording.initialized = true;
    const ownerId = state.session?.user?.id;
    if (!ownerId) return updateGpsRecordingUi();
    try {
      const saved = JSON.parse(localStorage.getItem(gpsStorageKey(GPS_RECORDING_STORAGE_PREFIX, ownerId)) || 'null');
      if (saved?.version !== 1 || saved.ownerId !== ownerId || !['recording', 'paused'].includes(saved.status) || !Array.isArray(saved.points)) {
        updateGpsRecordingUi();
        return;
      }
      Object.assign(gpsRecording, {
        id: saved.id || createRouteUuid(), ownerId, status: saved.status,
        points: saved.points.filter(point => Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat))),
        region: saved.region || $('#region')?.value || 'furano', startedAt: saved.startedAt || new Date().toISOString(),
        elapsedBeforePauseMs: Number(saved.elapsedBeforePauseMs) || 0,
        lastResumedAt: saved.status === 'recording' ? (Number(saved.lastResumedAt) || Date.now()) : null,
        lastError: saved.lastError || ''
      });
      gpsRecordingDistanceKmValue = distanceKm(gpsRecording.points);
      renderGpsRecordingRoute();
      updateGpsRecordingUi();
      if (gpsRecording.status === 'recording') {
        gpsRecordingAction = 'starting';
        const finishTransition = beginGpsWatcherTransition();
        updateGpsRecordingUi();
        try { await startGpsRecordingWatcher(); } catch (error) { await handleGpsRecordingError(error); }
        finally {
          if (gpsRecordingAction === 'starting') gpsRecordingAction = '';
          finishTransition();
          updateGpsRecordingUi();
        }
      }
      toast('저장된 GPS 경로 기록을 복구했습니다.');
    } catch (error) {
      console.warn('GPS recording restore failed:', error);
      updateGpsRecordingUi();
    }
  }

  function initGpsRecordingInteractions() {
    ensureGpsProcessingIndicators();
    $('#rideShareBtn')?.addEventListener('click', () => {
      if (gpsRecording.status === 'idle') void startGpsRecording();
      else $('#gpsRecordingPanel')?.scrollIntoView?.({ block: 'nearest' });
    });
    $('#gpsRecordPauseBtn')?.addEventListener('click', () => {
      if (gpsRecordingAction) return toast('GPS 요청을 처리 중입니다. 잠시만 기다려 주세요.');
      if (gpsRecording.status === 'recording') void pauseGpsRecording();
      else if (gpsRecording.status === 'paused') void resumeGpsRecording();
    });
    $('#gpsRecordFinishBtn')?.addEventListener('click', () => {
      if (gpsRecordingAction === 'starting') return toast('GPS 기록 시작을 처리 중입니다. 잠시만 기다려 주세요.');
      void finishGpsRecording();
    });
    $('#gpsRecordingFinishForm')?.addEventListener('submit', event => {
      event.preventDefault();
      void saveFinishedGpsRecording();
    });
    $('#gpsRecordingDiscardBtn')?.addEventListener('click', () => { void discardFinishedGpsRecording(); });
    gpsRecordingUiTimer = setInterval(() => {
      if (gpsRecording.status === 'recording') updateGpsRecordingUi();
    }, 1000);
    if (!gpsRecordingLifecycleListenersRegistered) {
      gpsRecordingLifecycleListenersRegistered = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && ['recording', 'paused'].includes(gpsRecording.status)) persistGpsRecording();
        if (document.visibilityState === 'visible' && gpsRecording.status === 'recording') gpsRecordingResumeAt = Date.now();
      });
      window.addEventListener('pagehide', () => {
        if (['recording', 'paused'].includes(gpsRecording.status)) persistGpsRecording();
      });
    }
    updateGpsRecordingUi();
  }
  function resetProfile(message) { profile.samples = []; profile.layout = null; profile.view = null; profile.pending = false; clearTimeout(profile.timer); $('#profileMessage').textContent = message; $('#profileMessage').hidden = false; $('#profileTooltip').hidden = true;['#profileDistance', '#profileAscent', '#profileDescent', '#profileAverage', '#profileMaximum'].forEach(id => $(id).textContent = '—'); const canvas = $('#profileChart'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); clearProfileCursor(false); renderMobileCourseProfiles() }
  function routeSamples() { if (state.points.length < 2) return []; const samples = [{ ...state.points[0], distance: 0 }], totalBySegment = []; let total = 0; for (let i = 1; i < state.points.length; i++) { const a = state.points[i - 1], b = state.points[i], length = horizontalMeters(a, b), steps = Math.max(1, Math.round(length / PROFILE_SAMPLE_METERS)); totalBySegment.push({ a, b, length, start: total, steps }); total += length } for (const segment of totalBySegment) { for (let step = 1; step <= segment.steps; step++) { const t = step / segment.steps; samples.push({ lng: segment.a.lng + (segment.b.lng - segment.a.lng) * t, lat: segment.a.lat + (segment.b.lat - segment.a.lat) * t, distance: segment.start + segment.length * t }) } } return samples }
  function scheduleProfile(delay = 180) { const generation = ++profile.generation; clearTimeout(profile.timer); if (state.points.length < 2) { resetProfile(t('profileEmptyMsg')); return } resetProfile(t('profileWaitingDem')); profile.pending = true; profile.timer = setTimeout(() => startProfileCalc(generation), delay) }
  // Native map on screen: elevations come from the Native (offline) DEM; the GL map has no tiles offline.
  async function startProfileCalc(generation) {
    if (state.nativeMap.active && state.nativeMap.shown) {
      const plugin = nativeMapPlugin();
      try {
        const coords = routeSamples().map(sm => [sm.lng, sm.lat]);
        const { elevations } = await plugin.queryEmbeddedElevations({ coords });
        if (generation !== profile.generation) return;
        calculateProfile(generation, elevations);
        return;
      } catch (error) { console.warn('queryEmbeddedElevations failed:', error); }
    }
    calculateProfile(generation);
  }
  function calculateProfile(generation, nativeElevations) {
    if (generation !== profile.generation || state.points.length < 2) return; const samples = routeSamples(), total = samples.at(-1)?.distance || 0; if (total < .01) { resetProfile(t('profileNeed2Points')); return } let missing = false; for (let si = 0; si < samples.length; si++) { const sample = samples[si]; let elevation; try { elevation = nativeElevations ? nativeElevations[si] : map.queryTerrainElevation([sample.lng, sample.lat], { exaggerated: false }) } catch (error) { elevation = null } if (!Number.isFinite(elevation)) { missing = true; break } sample.elevation = elevation } if (generation !== profile.generation) return; if (missing) { profile.pending = true; $('#profileMessage').textContent = t('profileWaitingTiles'); $('#profileMessage').hidden = false; return } profile.pending = false; let ascent = 0, descent = 0, weightedSlope = 0, maxSlope = 0; for (let i = 1; i < samples.length; i++) { const horizontal = samples[i].distance - samples[i - 1].distance, elevationChange = samples[i].elevation - samples[i - 1].elevation, slope = Math.atan2(elevationChange, horizontal) * 180 / Math.PI; samples[i].slope = slope; if (elevationChange > 0) ascent += elevationChange; else descent -= elevationChange; weightedSlope += Math.abs(slope) * horizontal; maxSlope = Math.max(maxSlope, Math.abs(slope)) } samples[0].slope = 0; profile.samples = samples; $('#profileDistance').textContent = (total / 1000).toFixed(2) + ' km'; $('#profileAscent').textContent = Math.round(ascent) + ' m'; $('#profileDescent').textContent = Math.round(descent) + ' m'; $('#profileAverage').textContent = (weightedSlope / total).toFixed(1) + '°';
    const mobileSlopeEl = $('#mobileSlopeVal');
    if (mobileSlopeEl) mobileSlopeEl.textContent = (weightedSlope / total).toFixed(0); $('#profileMaximum').textContent = maxSlope.toFixed(1) + '°'; $('#descent').textContent = Math.round(descent) + ' m'; $('#profileMessage').hidden = true; profile.view = (state.nativeMap.active && state.nativeMap.shown) ? null : computeProfileView(); drawProfile(); renderMobileCourseProfiles(); if (state.nativeMap.active && state.nativeMap.shown) updateProfileViewport()
  }
  function slopeColor(deg) {
    const s = Math.min(45, Math.max(0, Math.abs(deg || 0)));
    let r, g, b;
    if (s <= 15) {
      const t = s / 15;
      r = Math.round(34 + (234 - 34) * t);
      g = Math.round(197 + (179 - 197) * t);
      b = Math.round(94 + (8 - 94) * t);
    } else if (s <= 30) {
      const t = (s - 15) / 15;
      r = Math.round(234 + (249 - 234) * t);
      g = Math.round(179 + (115 - 179) * t);
      b = Math.round(8 + (22 - 8) * t);
    } else {
      const t = (s - 30) / 15;
      r = Math.round(249 + (239 - 249) * t);
      g = Math.round(115 + (68 - 115) * t);
      b = Math.round(22 + (68 - 22) * t);
    }
    return `rgb(${r},${g},${b})`;
  }
  function drawProfileChart(canvas) {
    if (!canvas) return;
    const samples = profile.samples;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (samples.length < 2) return;
    const pad = { left: 8, right: 8, top: 10, bottom: 8 };
    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);
    // Horizontal axis = distance window currently visible on the map (whole course when no window is set).
    const total = samples.at(-1).distance || 1;
    const range = profileViewRange();
    const span = Math.max(1, range.end - range.start);
    const runs = profile.view ? profile.view.runs : [{ start: 0, end: total }];
    const visible = samples.filter(sm => runs.some(r => sm.distance >= r.start - 1e-6 && sm.distance <= r.end + 1e-6));
    let min = Infinity, max = -Infinity;
    for (const sm of visible) {
      if (sm.elevation < min) min = sm.elevation;
      if (sm.elevation > max) max = sm.elevation;
    }
    if (!visible.length) return;
    const elevationRange = Math.max(max - min, 10);
    const xFor = d => pad.left + ((d - range.start) / span) * plotWidth;
    const yFor = el => pad.top + (max - el) / elevationRange * plotHeight;
    if (canvas.id === 'profileChart') {
      profile.layout = { pad, plotWidth, plotHeight, total, start: range.start, end: range.end, min, max, xFor, yFor };
    }
    // Parts of the course that are not on screen: shaded band with dashed edges.
    for (let i = 1; i < runs.length; i++) {
      const x1 = xFor(runs[i - 1].end), x2 = xFor(runs[i].start);
      ctx.fillStyle = 'rgba(148,163,184,.10)';
      ctx.fillRect(x1, 0, Math.max(0, x2 - x1), height);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(148,163,184,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, height); ctx.moveTo(x2, 0); ctx.lineTo(x2, height); ctx.stroke();
      ctx.restore();
    }
    const stroke = ctx.createLinearGradient(pad.left, 0, width - pad.right, 0);
    let lastT = 0;
    for (const sm of visible) {
      let t = (sm.distance - range.start) / span;
      t = Math.max(lastT, Math.min(1, Math.max(0, t)));
      stroke.addColorStop(t, slopeColor(sm.slope));
      lastT = t;
    }
    if (lastT < 1) stroke.addColorStop(1, slopeColor(visible.at(-1).slope));
    const fill = ctx.createLinearGradient(0, pad.top, 0, height);
    fill.addColorStop(0, 'rgba(56,189,248,.28)');
    fill.addColorStop(1, 'rgba(56,189,248,0)');
    for (const r of runs) {
      const pts = samples.filter(sm => sm.distance >= r.start - 1e-6 && sm.distance <= r.end + 1e-6);
      if (!pts.length) continue;
      if (pts.length === 1) {
        ctx.beginPath(); ctx.arc(xFor(pts[0].distance), yFor(pts[0].elevation), 2.5, 0, Math.PI * 2); ctx.fillStyle = slopeColor(pts[0].slope); ctx.fill();
        continue;
      }
      ctx.beginPath();
      pts.forEach((sm, i) => { const x = xFor(sm.distance), y = yFor(sm.elevation); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.lineTo(xFor(pts.at(-1).distance), height);
      ctx.lineTo(xFor(pts[0].distance), height);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      pts.forEach((sm, i) => { const x = xFor(sm.distance), y = yFor(sm.elevation); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    if (profile.selected) {
      const sx = xFor(profile.selected.distance);
      const sy = yFor(profile.selected.elevation);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (canvas.id === 'profileChart' && (gapCut || segPick)) drawGapCutOverlay(ctx, { xFor, yFor, width, height });
  }
  function drawProfile() {
    const canvas = $('#profileChart');
    if (!canvas) return;
    drawProfileChart(canvas);
    bindProfileScrub(canvas);
    const tooltip = $('#profileTooltip');
    if (tooltip) {
      if (profile.selected && profile.samples.length > 1) {
        tooltip.textContent = profileReadoutText(profile.selected);
        tooltip.hidden = false;
      } else {
        tooltip.hidden = true;
      }
    }
  }
  // Engine-independent: cumulative distance -> interpolated position/elevation/slope on the route.
  function profileSampleAt(distance) {
    const s = profile.samples; if (s.length < 2 || !Number.isFinite(distance)) return null;
    const d = Math.max(0, Math.min(s.at(-1).distance, distance));
    let lo = 0, hi = s.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].distance < d) lo = mid + 1; else hi = mid }
    lo = Math.max(1, lo); const a = s[lo - 1], b = s[lo], span = b.distance - a.distance, f = span > 0 ? (d - a.distance) / span : 0;
    return { distance: d, lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f, elevation: a.elevation + (b.elevation - a.elevation) * f, slope: b.slope };
  }
  // ---- Visible-range logic (engine independent): which cumulative-distance ranges of the route are on screen. ----
  function visibleDistanceRuns(samples, isVisible) {
    const runs = []; let run = null;
    for (const sm of samples) {
      if (isVisible(sm)) { if (!run) run = { start: sm.distance, end: sm.distance }; else run.end = sm.distance; }
      else if (run) { runs.push(run); run = null; }
    }
    if (run) runs.push(run);
    return runs;
  }
  function profileViewFromRuns(runs, total) {
    if (!runs.length) return null;
    let start = runs[0].start, end = runs.at(-1).end;
    if (end - start < PROFILE_SAMPLE_METERS) { const pad = (PROFILE_SAMPLE_METERS - (end - start)) / 2; start = Math.max(0, start - pad); end = Math.min(total, end + pad); }
    return { start, end, runs };
  }
  function profileViewRange() {
    const total = profile.samples.at(-1)?.distance || 1;
    return profile.view && profile.view.end > profile.view.start ? { start: profile.view.start, end: profile.view.end } : { start: 0, end: total };
  }
  function isDistanceInProfileView(d) { return !profile.view || profile.view.runs.some(r => d >= r.start - 1e-6 && d <= r.end + 1e-6); }
  function snapDistanceToProfileView(d) {
    if (isDistanceInProfileView(d)) return d;
    let best = d, gap = Infinity;
    for (const r of profile.view.runs) for (const edge of [r.start, r.end]) if (Math.abs(edge - d) < gap) { gap = Math.abs(edge - d); best = edge; }
    return best;
  }
  // Only map-engine touchpoint of the window logic: is a route sample inside the current map viewport?
  function computeProfileView() {
    if (profile.samples.length < 2) return null;
    const canvas = map.getCanvas(), w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    return profileViewFromRuns(visibleDistanceRuns(profile.samples, sm => { const p = map.project([sm.lng, sm.lat]); return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h; }), profile.samples.at(-1).distance);
  }
  function sameProfileView(a, b) {
    if (!a || !b) return !a && !b;
    return Math.abs(a.start - b.start) < 1e-6 && Math.abs(a.end - b.end) < 1e-6 && a.runs.length === b.runs.length && a.runs.every((r, i) => Math.abs(r.start - b.runs[i].start) < 1e-6 && Math.abs(r.end - b.runs[i].end) < 1e-6);
  }
  // Called when a camera move finishes (not during the gesture).
  function updateProfileViewport() {
    if (profile.samples.length < 2) return;
    if (state.nativeMap.active && state.nativeMap.shown) { void updateProfileViewportNative(); return; }
    applyProfileView(computeProfileView());
  }
  function applyProfileView(next) {
    if (sameProfileView(profile.view, next)) return;
    profile.view = next;
    if (profile.selected && !isDistanceInProfileView(profile.selected.distance)) clearProfileCursor(false);
    drawProfile(); renderMobileCourseProfiles();
  }
  // Same range logic, but "is this route sample on screen?" is answered by the Native map's projection.
  async function updateProfileViewportNative() {
    const plugin = nativeMapPlugin();
    const samples = profile.samples;
    if (!plugin?.projectEmbeddedVisible || samples.length < 2) return;
    try {
      const { mask } = await plugin.projectEmbeddedVisible({ coords: samples.map(sm => [sm.lng, sm.lat]) });
      if (profile.samples !== samples || !mask || mask.length !== samples.length) return;
      const index = new Map(samples.map((sm, i) => [sm, i]));
      applyProfileView(profileViewFromRuns(visibleDistanceRuns(samples, sm => mask[index.get(sm)] === '1'), samples.at(-1).distance));
    } catch (error) { console.warn('projectEmbeddedVisible failed:', error); }
  }
  map.on('moveend', updateProfileViewport);
  function profileHeaderText(sample) { return `${(sample.distance / 1000).toFixed(2)}km · ${Math.round(sample.elevation)}m · ${sample.slope >= 0 ? '+' : ''}${sample.slope.toFixed(1)}°` }
  // Header info is visible only while the drawer is expanded AND a point is selected.
  function syncProfileHeaderReadouts() {
    for (const [toggleId, bodyId] of [['#mobileRoutesProfileToggle', '#mobileRoutesProfileBody'], ['#mobileEditorProfileToggle', '#mobileEditorProfileBody'], ['#mobileMapProfileToggle', '#mobileMapProfileBody']]) {
      const el = $(toggleId)?.querySelector('.profile-header-readout');
      if (!el) continue;
      const show = Boolean(profile.selected) && profile.samples.length > 1 && !$(bodyId)?.hidden;
      el.hidden = !show;
      if (show) el.textContent = profileHeaderText(profile.selected);
    }
  }
  function profileReadoutText(sample) { return `${(sample.distance / 1000).toFixed(2)} km · ${Math.round(sample.elevation)} m · ${sample.slope >= 0 ? '+' : ''}${sample.slope.toFixed(1)}°` }
  // Only map-engine touchpoint: a small yellow cross (distinct from the blue GPS dot/arrow); the camera is never moved.
  function showProfileCursor(sample) {
    if (!profile.marker) {
      const el = document.createElement('div');
      el.style.cssText = 'width:18px;height:18px;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))';
      el.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2v14M2 9h14" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/><path d="M9 2v14M2 9h14" stroke="#facc15" stroke-width="2.6" stroke-linecap="round"/></svg>';
      profile.marker = new mapboxgl.Marker({ element: el }).setLngLat([sample.lng, sample.lat]).addTo(map);
    }
    profile.marker.setLngLat([sample.lng, sample.lat]);
    pushNativeCursor(sample);
  }
  function clearProfileCursor(redraw = true) {
    profile.selected = null;
    pushNativeCursor(null);
    if (profile.marker) { profile.marker.remove(); profile.marker = null }
    if (redraw) { drawProfile(); renderMobileCourseProfiles() }
  }
  function selectProfileDistance(distance) {
    const sample = profileSampleAt(snapDistanceToProfileView(distance)); if (!sample) return null;
    profile.selected = sample; showProfileCursor(sample); drawProfile(); renderMobileCourseProfiles(); return sample;
  }
  function inspectProfile(event) {
    if (!profile.samples.length) return;
    if (event.preventDefault) event.preventDefault();
    const canvas = $('#profileChart');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pad = profile.layout?.pad || { left: 8, right: 8 };
    const plotWidth = profile.layout?.plotWidth || Math.max(1, rect.width - pad.left - pad.right);
    const range = profileViewRange();
    const localX = Math.max(0, Math.min(plotWidth, event.clientX - rect.left - pad.left));
    const target = range.start + (localX / plotWidth) * (range.end - range.start);
    const sample = selectProfileDistance(target);
    if (!sample) return;
    const tooltip = $('#profileTooltip');
    if (tooltip) {
      tooltip.textContent = profileReadoutText(sample);
      tooltip.hidden = false;
    }
  }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2500) }
  function setRegion() { const region = $('#region').value, r = regions[region]; if (!r) return; map.flyTo({ center: r.center, zoom: r.zoom, bearing: r.bearing, pitch: r.pitch, duration: 1400 }); loadSkiData(region); clearLine(); toast(t('toastRegionMoved', r.label)) }
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
    if (adminRegionPicker) return;
    if (!state.editorMode) return;
    if (gapCut) { handleGapCutClick(e); return; }
    if (state.tool === 'edit' && pcSparseEditing()) {
      // PC 포인트 추가: click the route line (not an existing marker) to place an edit point there.
      if (map.getLayer('route-points') && map.queryRenderedFeatures(e.point, { layers: ['route-points'] }).length) return;
      addEditPointAt(e.point);
      return;
    }
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
      if (adminRegionPicker || gapCut) return; // gap-cut markers are not draggable route vertices
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
        if (segPick) { segPickAccept(routePosition(state.points, i)); return; } // graph-started A/B: map point can be B
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
      syncVertexToGraph(i); // map selection → same position on the graph
      isDragging = true;
      let dragHistorySaved = false;
      dragIndex = i;
      const falloff = buildDragFalloff(i); // null → original single-point drag
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
        if (falloff) applyDragFalloff(falloff, ev.lngLat);
        else state.points[dragIndex] = { lng: ev.lngLat.lng, lat: ev.lngLat.lat };
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
    if (adminRegionPicker || gapCut) return;
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

  function escapeXml(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
  }

  function gpxString(exportRoute = null) {
    const now = new Date().toISOString();
    const course = exportRoute || getActiveCourse();
    const rawName = (exportRoute?.name || $('#courseName')?.value?.trim() || course?.name || 'Powderline route').trim() || 'Powderline route';
    const escapedName = escapeXml(rawName);
    const rawPoints = exportRoute ? exportRoute.points : (Array.isArray(state.points) && state.points.length)
      ? state.points
      : (Array.isArray(course?.points) ? course.points : []);
    const trkpts = [];
    for (let i = 0; i < rawPoints.length; i++) {
      const p = rawPoints[i];
      if (!p) continue;
      const lat = Number(p.lat);
      const lon = Number(p.lng ?? p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      let eleVal = null;
      if (p.ele !== undefined && p.ele !== null && p.ele !== '' && Number.isFinite(Number(p.ele))) {
        eleVal = Number(p.ele);
      } else if (p.elevation !== undefined && p.elevation !== null && p.elevation !== '' && Number.isFinite(Number(p.elevation))) {
        eleVal = Number(p.elevation);
      } else if (!exportRoute && typeof map?.queryTerrainElevation === 'function') {
        try {
          const demEle = map.queryTerrainElevation([lon, lat], { exaggerated: false });
          if (typeof demEle === 'number' && Number.isFinite(demEle)) eleVal = demEle;
        } catch {}
      }
      let timeIso = null;
      const rawTime = p.time ?? p.timestamp;
      if (rawTime !== undefined && rawTime !== null && rawTime !== '') {
        const parsedTime = new Date(rawTime);
        if (!Number.isNaN(parsedTime.getTime())) timeIso = parsedTime.toISOString();
      }
      let children = '';
      if (eleVal !== null) children += '<ele>' + Number(eleVal.toFixed(2)) + '</ele>';
      if (timeIso !== null) children += '<time>' + escapeXml(timeIso) + '</time>';
      trkpts.push(
        children
          ? '      <trkpt lat="' + lat + '" lon="' + lon + '">' + children + '</trkpt>'
          : '      <trkpt lat="' + lat + '" lon="' + lon + '"/>'
      );
    }
    if (trkpts.length < 2) return '';
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" version="1.1" creator="POWDERLINE">',
      '  <metadata>',
      '    <name>' + escapedName + '</name>',
      '    <time>' + now + '</time>',
      '  </metadata>',
      '  <trk>',
      '    <name>' + escapedName + '</name>',
      '    <trkseg>',
      trkpts.join('\n'),
      '    </trkseg>',
      '  </trk>',
      '</gpx>'
    ].join('\n');
  }

  let gpxFileSaverPlugin = null;
  function getGpxFileSaverPlugin() {
    const capacitor = window.Capacitor;
    if (capacitor?.getPlatform?.() !== 'android') return null;
    gpxFileSaverPlugin ||= capacitor.registerPlugin
      ? capacitor.registerPlugin('GpxFileSaver')
      : capacitor.Plugins?.GpxFileSaver || null;
    return gpxFileSaverPlugin;
  }

  // Android: 시스템 저장창(SAF)으로 저장. 결과 { saved, cancelled } — 실패 시 throw.
  async function saveGpxWithNativeSaver(xml, fileName) {
    const plugin = getGpxFileSaverPlugin();
    if (!plugin?.saveGpx) throw new Error('GPX 저장 기능을 사용할 수 없습니다.');
    return plugin.saveGpx({ content: xml, fileName });
  }

  $('#exportBtn').addEventListener('click', async () => {
    if (blockedByGapCut()) return;
    if (state.points.length < 2) return toast(t('toastNeedRouteFirst'));
    const xml = gpxString();
    if (!xml) return toast(t('toastNeedRouteFirst'));
    const cur = getActiveCourse();
    const fname = (cur?.name || 'powderline-route').trim().replace(/[/\\?%*:|"<>]/g, '-') || 'powderline-route';
    const gpxSaver = getGpxFileSaverPlugin();
    if (gpxSaver) {
      try {
        const result = await saveGpxWithNativeSaver(xml, fname + '.gpx');
        if (result?.saved === true) toast(t('toastExportedGpx'));
      } catch (error) {
        toast(error?.message || 'GPX 파일을 저장하지 못했습니다.');
      }
      return;
    }
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' }));
    a.href = url;
    a.download = fname + '.gpx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('toastExportedGpx'));
  });

  const gpxInputEl = $('#gpxInput');
  if (gpxInputEl && (window.Capacitor?.getPlatform?.() === 'android' || /Android/i.test(navigator.userAgent))) {
    gpxInputEl.accept = '.gpx,application/gpx+xml,application/octet-stream,application/xml,text/xml,*/*';
  }

  $('#gpxInput').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.name && !/\.gpx$/i.test(f.name)) {
      toast('GPX 파일(.gpx)을 선택해 주세요.');
      e.target.value = '';
      return;
    }
    try {
      const xml = new DOMParser().parseFromString(await f.text(), 'application/xml');
      const pts = [...xml.querySelectorAll('trkpt,rtept')].map(n => ({ lat: +n.getAttribute('lat'), lng: +n.getAttribute('lon') }));
      if (!pts.length) {
        toast('유효한 GPX 트랙 좌표가 없습니다.');
        return;
      }
      pushHistory();
      state.points = markGpxShapePoints(pts); // PC: only start/end markers; full geometry kept
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
    } finally {
      e.target.value = '';
    }
  });

  // PC web only: saved courses grouped into collapsible folders by region display name (unassigned → own folder).
  const PC_SAVED_FOLDERS_KEY = 'powderline.pcSavedCollapsedFolders';
  const PC_SAVED_UNASSIGNED = '__unassigned__';
  const pcSavedCollapsedFolders = new Set((() => {
    try { const v = JSON.parse(localStorage.getItem(PC_SAVED_FOLDERS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  })());
  function groupSavedByRegion(saved) {
    const groups = new Map();
    saved.forEach((route, index) => {
      const key = route.region ? String(route.region) : PC_SAVED_UNASSIGNED;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    });
    const order = key => key === PC_SAVED_UNASSIGNED ? Infinity : (regions[key]?.sortOrder ?? 9999);
    return [...groups.entries()]
      .map(([key, indexes]) => ({ key, indexes, label: key === PC_SAVED_UNASSIGNED ? '지역 미지정' : (regions[key]?.label || key) }))
      .sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label));
  }
  // PC sidebar list: own cloud courses / device-only courses get a delete button next to the item.
  const savedRowHtml = (r, i) => '<div class="saved-row"><button class="saved-item" data-i="' + i + '"><span>' + escapeHtml(r.name) + '</span><small>' + r.km.toFixed(1) + ' km' + (r.syncStatus === 'pending' ? ' · 동기화 대기' : '') + '</small></button>'
    + (canDeleteSavedRoute(r) ? '<button class="saved-delete" type="button" data-i="' + i + '" aria-label="' + escapeHtml(r.name) + ' 코스 삭제">삭제</button>' : '') + '</div>';

  // PC sidebar: region name + course count only. The course rows live in the region modal.
  function renderPcSavedTree() {
    return groupSavedByRegion(state.saved).map(({ key, indexes, label }) =>
      '<button type="button" class="pc-saved-folder pc-saved-region" data-folder="' + escapeHtml(key) + '" aria-haspopup="dialog">' +
      '<span class="material-symbols-outlined" aria-hidden="true">folder</span><span class="pc-saved-folder-name">' + escapeHtml(label) + '</span>' +
      '<span class="pc-saved-folder-count">' + indexes.length + '</span></button>').join('');
  }
  function closePcRegionModal() {
    pcRegionModalKey = null;
    const m = $('#pcRegionCoursesModal'); if (m) m.hidden = true;
  }
  function renderPcRegionModal() {
    const m = $('#pcRegionCoursesModal'); if (!m || pcRegionModalKey === null) return;
    const group = groupSavedByRegion(state.saved).find(g => g.key === pcRegionModalKey);
    if (!group) { closePcRegionModal(); return; }
    $('#pcRegionCoursesTitle').textContent = group.label + ' · ' + group.indexes.length;
    const body = $('#pcRegionCoursesBody');
    body.innerHTML = group.indexes.map(i => savedRowHtml(state.saved[i], i)).join('');
    bindSavedRowActions(body);
    m.hidden = false;
  }
  function openPcRegionModal(key) {
    if (document.body.dataset.pcWeb !== 'true') return;
    if (!$('#pcAccountModal')?.hidden) closePcAccountModal();
    if (!$('#pcAdminModal')?.hidden) closePcAdminModal();
    pcRegionModalKey = key;
    renderPcRegionModal();
  }

  function renderSaved() {
    const el = $('#savedList');
    $('#savedCount').textContent = state.saved.length;
    if (!state.saved.length) {
      el.innerHTML = '<p class="empty" data-i18n="emptySaved">' + t('emptySaved') + '</p>';
      closePcRegionModal();
      return;
    }
    el.innerHTML = document.body.dataset.pcWeb === 'true'
      ? renderPcSavedTree()
      : state.saved.map(savedRowHtml).join('');
    el.querySelectorAll('.pc-saved-region').forEach(b => b.addEventListener('click', () => openPcRegionModal(b.dataset.folder)));
    renderMobileSavedRoutes();
    if (document.body.dataset.pcWeb !== 'true') bindSavedRowActions(el);
    if (pcRegionModalKey !== null) renderPcRegionModal();
  }

  function bindSavedRowActions(root) {
    root.querySelectorAll('.saved-delete').forEach(b => b.addEventListener('click', async event => {
      event.stopPropagation();
      const item = state.saved[+b.dataset.i];
      if (!canDeleteSavedRoute(item)) { toast('직접 만든 코스만 삭제할 수 있습니다.'); return; }
      if (!window.confirm(state.lang === 'ko' ? `"${item.name}" 코스를 삭제하시겠습니까?` : `Delete course "${item.name}"?`)) return;
      if (!(await deleteSavedRoute(item))) return;
      const cur = getActiveCourse();
      if (cur && item.source === 'cloud' && cur.databaseId === item.id) { cur.databaseId = null; cur.saved = false; }
      mobileSelectedSavedIndex = '';
      renderSaved();
      toast(state.lang === 'ko' ? '코스가 삭제되었습니다.' : 'Course deleted.');
    }));
    root.querySelectorAll('.saved-item').forEach(b => b.addEventListener('click', () => {
      const item = state.saved[+b.dataset.i];
      pushHistory();
      state.points = prepareEditPoints(item.points);
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
      closePcRegionModal();
      toast(t('toastLoadedSaved'));
    }));
  }

  async function saveActiveCourse() {
    if (gapCut) { // not saved until the new section is connected
      toast(state.lang === 'ko' ? '새 구간을 연결 완료한 뒤 저장해 주세요.' : 'Join the new section before saving.');
      return false;
    }
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
        points: encodeEditPointsForSave(state.points),
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
      const savedPoints = (Array.isArray(data.points) ? data.points : payload.points)
        .filter(point => Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat)))
        .map(point => ({ ...point, lng: Number(point.lng), lat: Number(point.lat) }));
      const savedRoute = { id: data.id, name: data.name, region: data.region, km: Number(data.distance_km) || km, points: savedPoints, createdAt: data.created_at, updatedAt: data.updated_at, ownerId: state.session.user.id, source: 'cloud' };
      state.saved = [savedRoute, ...state.saved.filter(route => route.id !== data.id)];
      // Server save succeeded; also keep the full course on the device so it shows offline.
      const cached = upsertCachedCloudRoute(state.session.user.id, savedRoute);
      toast(cached ? t('toastSavedCloud') : 'Supabase에는 저장되었지만 이 기기에 오프라인용 사본을 저장하지 못했습니다. 온라인에서 코스 목록을 다시 불러오면 저장됩니다.');
    } else {
      const savedRoute = { name, region: courseRegion, km, points: state.points.map(point => ({ ...point })), source: 'local' };
      const previousIndex = state.saved.indexOf(mobileEditingSavedRoute);
      if (previousIndex >= 0) state.saved.splice(previousIndex, 1, savedRoute);
      else state.saved.unshift(savedRoute);
      let localStored = true;
      try { localStorage.setItem('powderline.routes', JSON.stringify(state.saved.filter(route => route.source !== 'cloud' && !route.recordingOwnerId))); }
      catch (error) { localStored = false; console.warn('Local route save failed:', error); }
      toast(localStored ? t('toastSavedLocal') : '코스를 이 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요. (앱을 종료하면 사라질 수 있습니다)');
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
    if (mobileEditingSavedRoute?.syncStatus === 'pending') {
      toast('서버 동기화가 완료되기 전에는 기록 코스를 삭제할 수 없습니다.');
      return;
    }
    // The saved course behind this editor tab (if any); unsaved drafts are only closed.
    const savedItem = cur.databaseId
      ? state.saved.find(r => r.source === 'cloud' && r.id === cur.databaseId)
        // not in the list (yet): the server delete is still restricted to the signed-in user's own row
        || { source: 'cloud', id: cur.databaseId, name: cur.name, ownerId: state.session?.user?.id }
      : mobileEditingSavedRoute && state.saved.includes(mobileEditingSavedRoute) ? mobileEditingSavedRoute : null;
    if (savedItem && !canDeleteSavedRoute(savedItem)) { toast('직접 만든 코스만 삭제할 수 있습니다.'); return; }
    const confirmName = savedItem?.name || cur.name;
    const confirmMsg = state.lang === 'ko' ? `"${confirmName}" 코스를 삭제하시겠습니까?` : `Delete course "${confirmName}"?`;
    if (!window.confirm(confirmMsg)) return;

    if (savedItem && !(await deleteSavedRoute(savedItem))) return;
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

  // PC 구간 자르기·연결 panel
  $('#gapCutNextPassBtn')?.addEventListener('click', cycleGapCutPass);
  $('#gapCutConfirmBtn')?.addEventListener('click', () => {
    if (gapCut?.phase !== 'preview') return;
    gapCut.phase = 'draw'; // removed section is dropped from the preview; route data changes only on 연결 완료
    gapCut.candidates = [];
    syncGapCutUi();
    render();
  });
  $('#gapCutUndoPointBtn')?.addEventListener('click', () => {
    if (gapCut?.phase !== 'draw' || !gapCut.connection.length) return;
    gapCut.connection.pop();
    syncGapCutUi();
    render();
  });
  $('#gapCutFinishBtn')?.addEventListener('click', finishGapCut);
  $('#segDeleteConfirmBtn')?.addEventListener('click', confirmSegPick);
  $('#segDeleteCancelBtn')?.addEventListener('click', () => cancelSegPick(true));
  $('#gapCutCancelBtn')?.addEventListener('click', () => { cancelGapCut(true); setEditorTool('edit'); });

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
    await loadUserProfile();
    if (!state.profile) {
      activateOfflineAccess(supabaseClient, new Error('Online profile verification failed.'));
      return;
    }
    onlineAuthVerified = Boolean(state.profile);
    if (state.profile?.status === 'approved') saveOfflineAccessGrant(state.session, state.profile);
    else clearOfflineAccessGrant(state.session?.user?.id);
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
        clearOfflineAccessGrant(data.session.user?.id);
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
    e.currentTarget.disabled = true;
    clearOfflineAccessGrant();
    const { error } = supabaseClient ? await supabaseClient.auth.signOut() : { error: null };
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
  $('#liftsToggle').addEventListener('change', e => setLayerVisibility(['ski-lifts-line', 'ski-lifts-label', 'ski-lifts', 'ski-lift-terminals'], e.target.checked));
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
  bindProfileScrub($('#profileChart'));
  $('#profileChart').addEventListener('pointermove', e => { if (!e.buttons) inspectProfile(e); });
  $('#profileChart').addEventListener('pointerleave', () => {
    if (!profile.selected) {
      const tt = $('#profileTooltip');
      if (tt) tt.hidden = true;
    }
  });
  window.addEventListener('resize', () => requestAnimationFrame(drawProfile));

  const adminRoutePageSize = 50;
  let adminRoutes = [];
  let adminRoutePage = 0;
  let adminRouteHasMore = true;
  let adminRouteLoading = false;
  let adminRouteLoadError = '';
  let adminRouteSearchTimer = null;
  let adminRoutePreviewRequest = 0;
  let adminRoutePreviewMap = null;
  let adminRoutesForbiddenForUser = null;

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

  const pcLayoutOrigins = new Map();
  let pcAdminActiveTab = 'users';
  // Must be initialised before initMobileHud() → syncMobileMode() → syncPcWebLayout() → getPcMapCtrlNodes() runs;
  // declaring it later threw a TDZ ReferenceError that aborted app.js before initializeSupabase() (stuck on 계정 상태).
  let pcMapCtrlNodes = null;

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
      if (view === 'course-editor' && state.nativeMap.session && mobileHomeMapMode === 'offline') {
        toast('오프라인 지도에서는 코스 보기·위치 확인만 지원합니다. 코스 생성·수정은 온라인 지도에서 이용해 주세요.');
        return;
      }
      const nextView = ['home', 'map', 'ride', 'routes', 'course-editor', 'party', 'party-create', 'party-leader', 'party-invite', 'party-joined', 'party-received', 'account'].includes(view) ? view : 'map';
      const activeTab = nextView === 'course-editor' ? 'routes' : ['party-create', 'party-leader', 'party-invite', 'party-joined', 'party-received'].includes(nextView) ? 'party' : nextView === 'ride' ? 'map' : nextView;
      const prevView = document.body.dataset.mobileView;
      if (prevView && prevView !== nextView && !state.backNavigating) {
        const at = state.viewStack.lastIndexOf(nextView);
        if (at >= 0) state.viewStack.length = at; else state.viewStack.push(prevView);
        if (state.viewStack.length > 20) state.viewStack.shift();
      }
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
      if (nextView === 'home' && typeof renderMobileHome === 'function') {
        renderMobileHome();
        void refreshMobileHomeCatalog();
      }
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
        if (state.profile?.role === 'admin' && state.profile?.status === 'approved') {
          loadPendingUsers();
        }
      }
      requestAnimationFrame(() => {
        map.resize();
        if ((nextView === 'map' || nextView === 'ride') && !profilePanel?.classList.contains('collapsed')) drawProfile();
        if (['routes', 'course-editor', 'map', 'ride'].includes(nextView)) renderMobileCourseProfiles();
        scheduleNativeMapSync();
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
      if (typeof syncPcWebLayout === 'function') {
        syncPcWebLayout(!isNativeMobileApp() && !mobileMedia.matches);
      }
      if (typeof syncMobileAuthState === 'function') syncMobileAuthState(); // PC ↔ mobile web auth styling
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
        if (nativeCameraCommand('tilt')) return; // Native map: its camera event updates the 2D/3D labels
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
        if (state.nativeMap.active && state.nativeMap.shown) { toast('다운로드한 오프라인 지도는 위성 스타일만 지원합니다.'); return; }
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
        if (nativeCameraCommand('north')) return;
        map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
      });
      map.on('rotate', () => {
        const rotation = 'rotate(' + (-map.getBearing()) + 'deg)';
        if (mobileCompassNeedle) mobileCompassNeedle.style.transform = rotation;
        const rideCompassNeedle = $('#rideCompassNeedle');
        if (rideCompassNeedle) rideCompassNeedle.style.transform = rotation;
      });
    }

    $('#mobileZoomInBtn')?.addEventListener('click', () => { if (!nativeCameraCommand('zoomIn')) map.zoomIn({ duration: 300 }); });
    $('#mobileZoomOutBtn')?.addEventListener('click', () => { if (!nativeCameraCommand('zoomOut')) map.zoomOut({ duration: 300 }); });
    $('#mobileLocateBtn')?.addEventListener('click', () => triggerMyLocationGps({ center: true }));
    $('#mobileInfoBtn')?.addEventListener('click', () => $('#mobileMapProfileToggle')?.click());
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
  // PC Web Layout & Unified Admin Console (Isolated from Android Native App)
  // ==========================================================================

  function moveNodeWithOrigin(node, targetParent) {
    if (!node || !targetParent) return;
    if (!pcLayoutOrigins.has(node)) {
      pcLayoutOrigins.set(node, { parent: node.parentNode, nextSibling: node.nextSibling });
    }
    if (node.parentNode !== targetParent) {
      targetParent.appendChild(node);
    }
  }

  function restoreNodeToOrigin(node) {
    const origin = pcLayoutOrigins.get(node);
    if (!origin || !origin.parent) return;
    if (node.parentNode !== origin.parent) {
      if (origin.nextSibling && origin.nextSibling.parentNode === origin.parent) {
        origin.parent.insertBefore(node, origin.nextSibling);
      } else {
        origin.parent.appendChild(node);
      }
    }
  }

  // PC right-top map controls -------------------------------------------------------------------------------
  // (pcMapCtrlNodes is declared with pcLayoutOrigins: syncPcWebLayout already runs from initMobileHud() at startup.)
  function getPcMapCtrlNodes() {
    if (!pcMapCtrlNodes) { // resolved once from the map's own DOM (before they are moved); no Mapbox private API
      const root = $('#map');
      const pick = selector => root?.querySelector(selector)?.closest('.mapboxgl-ctrl');
      const nodes = [pick('.mapboxgl-ctrl-geolocate'), pick('.mapboxgl-ctrl-zoom-in')].filter(Boolean);
      if (nodes.length === 2) pcMapCtrlNodes = nodes;
    }
    return pcMapCtrlNodes || [];
  }
  // 2D = pitch 0; 3D = the region's default tilt. Center/zoom/bearing are left untouched by easeTo.
  function pcSetMapView(mode) {
    const pitch = mode === '2d' ? 0 : (Number(regions[$('#region')?.value]?.pitch) || 54);
    map.easeTo({ pitch, duration: 700 });
    syncPcViewSwitch(pitch);
  }
  function syncPcViewSwitch(pitch = map.getPitch()) {
    const is3d = pitch > 1;
    for (const [id, on] of [['#pcView2dBtn', !is3d], ['#pcView3dBtn', is3d]]) {
      const button = $(id);
      if (!button) continue;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }

  function syncPcWebLayout(enable) {
    const active = Boolean(enable) && !isNativeMobileApp();
    const topHeader = $('#pcTopHeader');
    const brandSlot = $('#pcHeaderBrandSlot');
    const accountModalBody = $('#pcAccountModalBody');
    const brandHeader = $('.sidebar .brand-header') || $('#pcHeaderBrandSlot .brand-header');
    const regionSelect = $('#region');
    const styleSwitch = $('.sidebar .style-switch') || $('#pcHeaderControlsSlot .style-switch') || $('#pcMapStyleSlot .style-switch');
    const mapControls = $('#pcMapControls');
    const mapNavNodes = getPcMapCtrlNodes(); // existing Mapbox locate + zoom/compass groups (reused, not recreated)
    const authPanel = $('.auth-panel');
    const settingsNodes = [...document.querySelectorAll('.sidebar > details.settings, #pcAccountModalBody > details.settings')];
    const profileTooltip = $('#profileTooltip');
    const wasActive = document.body.dataset.pcWeb === 'true';

    if (active) {
      document.body.dataset.pcWeb = 'true';
      if (topHeader) topHeader.hidden = false;
      moveNodeWithOrigin(brandHeader, brandSlot);
      // #region stays (or returns) in its own place: the top of the sidebar controls, above 코스 만들기 / 표시 설정.
      restoreNodeToOrigin(regionSelect);
      if (mapControls) mapControls.hidden = false;
      moveNodeWithOrigin(styleSwitch, $('#pcMapStyleSlot')); // map right-top only; no longer in the header
      mapNavNodes.forEach(node => moveNodeWithOrigin(node, $('#pcMapNavSlot'))); // order: locate → zoom in/out → compass
      moveNodeWithOrigin(authPanel, accountModalBody);
      settingsNodes.forEach(node => moveNodeWithOrigin(node, accountModalBody));
      // Selected-point readout: out of the graph, into the panel title (same single element → no duplicate).
      moveNodeWithOrigin(profileTooltip, $('#profileToggle'));
      if (profileTooltip?.parentNode && $('#profileChevron')?.parentNode === profileTooltip.parentNode) {
        profileTooltip.parentNode.insertBefore(profileTooltip, $('#profileChevron')); // title · readout · chevron
      }
      syncPcHeaderAuth();
    } else {
      delete document.body.dataset.pcWeb;
      if (topHeader) topHeader.hidden = true;
      closePcAccountModal();
      closePcAdminModal();
      if (mapControls) mapControls.hidden = true;
      [brandHeader, regionSelect, styleSwitch, ...mapNavNodes, authPanel, ...settingsNodes, profileTooltip].forEach(restoreNodeToOrigin);
    }
    syncPcViewSwitch();
    if (wasActive !== active) renderSaved(); // folder tree (PC) ↔ flat list (others)
    applyPcEditorLabels();
    requestAnimationFrame(() => { map.resize(); drawProfile(); });
  }

  function syncPcHeaderAuth() {
    const adminBtn = $('#pcAdminOpenBtn');
    const accountLabel = $('#pcAccountBtnLabel');
    const badge = $('#pcAdminPendingBadge');
    const tabBadge = $('#pcAdminTabPendingBadge');
    const isAdmin = isApprovedAdmin();
    const signedIn = Boolean(state.session?.user);
    const pendingCount = state.pendingUsers ? state.pendingUsers.length : 0;

    if (accountLabel) {
      if (signedIn) {
        const nick = state.profile?.nickname || state.session.user.user_metadata?.nickname || state.session.user.email || '계정·설정';
        accountLabel.textContent = nick;
      } else {
        accountLabel.textContent = '계정·설정';
      }
    }
    if (adminBtn) adminBtn.hidden = !isAdmin;
    for (const el of [badge, tabBadge]) {
      if (!el) continue;
      el.textContent = String(pendingCount);
      el.hidden = !isAdmin || pendingCount === 0;
    }
    if (!isAdmin && !$('#pcAdminModal')?.hidden) {
      closePcAdminModal();
    }
  }

  // ---- PC 회원탈퇴 (UI + safe client call). The account is deleted ONLY by the server-side Edge Function 'delete-my-account'
  // (JWT-verified, password re-auth, atomic DB function). The browser never holds a service key and never sends a user id. ----
  let pcWithdrawBusy = false;
  function withdrawText() { return state.lang === 'ko' ? {
    title: '회원탈퇴',
    info: '<p><strong>탈퇴하면 계정이 영구 삭제되며 복구할 수 없습니다.</strong></p><p>삭제되는 데이터</p><ul><li>계정 정보(이메일, 닉네임, 승인 상태)</li><li>내가 클라우드에 저장한 모든 코스</li><li>내 파티 멤버십·초대 기록, 그리고 나 혼자 남은 내 파티</li><li>이 브라우저에 저장된 내 계정의 로컬 캐시와 로그인 세션</li></ul><p>삭제되지 않는 것: 다른 회원의 데이터와 공유 데이터(지역·스키장 정보). 다른 멤버가 있는 파티의 리더이거나 마지막 관리자라면 탈퇴할 수 없으며, 정리 후 다시 시도해야 합니다.</p>',
    pw: '비밀번호 확인 (본인 확인)', ack: '위 내용을 확인했으며 계정과 데이터가 영구 삭제됨을 이해합니다.', cancel: '취소', submit: '회원탈퇴', busy: '처리 중…',
  } : {
    title: 'Delete account',
    info: '<p><strong>Your account will be permanently deleted and cannot be recovered.</strong></p><p>What is deleted</p><ul><li>Account info (email, nickname, approval status)</li><li>All courses you saved to the cloud</li><li>Your party memberships/invitations and parties where you are the only member</li><li>Local caches of your account and the login session in this browser</li></ul><p>Not deleted: other members\' data and shared data (regions, ski data). You cannot delete the account while you lead a party with other members or are the last administrator; resolve that first.</p>',
    pw: 'Confirm password (identity check)', ack: 'I understand that my account and data will be permanently deleted.', cancel: 'Cancel', submit: 'Delete account', busy: 'Working…',
  }; }
  function syncPcWithdrawSubmit() {
    const btn = $('#pcWithdrawSubmitBtn'); if (!btn) return;
    btn.disabled = pcWithdrawBusy || !$('#pcWithdrawPassword')?.value || !$('#pcWithdrawAck')?.checked;
  }
  function openPcWithdrawModal() {
    if (document.body.dataset.pcWeb !== 'true' || !state.session?.user) return;
    const tx = withdrawText();
    $('#pcWithdrawTitle').textContent = tx.title; $('#pcWithdrawInfo').innerHTML = tx.info; $('#pcWithdrawPwLabel').textContent = tx.pw;
    $('#pcWithdrawAckLabel').textContent = tx.ack; $('#pcWithdrawCancelBtn').textContent = tx.cancel; $('#pcWithdrawSubmitBtn').textContent = tx.submit;
    $('#pcWithdrawPassword').value = ''; $('#pcWithdrawAck').checked = false;
    const err = $('#pcWithdrawError'); err.hidden = true; err.textContent = '';
    syncPcWithdrawSubmit();
    $('#pcWithdrawModal').hidden = false;
    $('#pcWithdrawPassword').focus();
  }
  function closePcWithdrawModal() {
    if (pcWithdrawBusy) return; // never abandon a request that is in flight
    const m = $('#pcWithdrawModal'); if (m) m.hidden = true;
    const pw = $('#pcWithdrawPassword'); if (pw) pw.value = '';
  }
  function withdrawErrorMessage(code, kind) {
    const ko = state.lang === 'ko';
    const untouched = ko ? ' 계정과 데이터는 변경되지 않았습니다.' : ' Your account and data were not changed.';
    const map = {
      PASSWORD_INVALID: ko ? '비밀번호가 올바르지 않습니다.' + untouched : 'Incorrect password.' + untouched,
      PARTY_LEADER: ko ? '다른 멤버가 있는 파티의 리더입니다. 파티를 해산하거나 멤버를 정리한 뒤 다시 시도해 주세요.' + untouched : 'You lead a party that has other members. Disband it or remove the members first.' + untouched,
      LAST_ADMIN: ko ? '마지막 관리자 계정은 탈퇴할 수 없습니다. 다른 관리자를 지정한 뒤 시도해 주세요.' + untouched : 'The last administrator cannot be deleted. Appoint another administrator first.' + untouched,
      ROUTE_IN_USE: ko ? '내 코스가 다른 회원의 파티에서 사용 중입니다. 해당 파티에서 코스를 변경한 뒤 다시 시도해 주세요.' + untouched : 'One of your courses is used by another member\'s party. Change it there first.' + untouched,
      UNAUTHORIZED: ko ? '로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.' : 'Your session expired. Sign in again and retry.',
      NOT_DEPLOYED: ko ? '회원탈퇴 서버 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' + untouched : 'The account deletion service is not set up yet. Please contact the administrator.' + untouched,
      NETWORK: ko ? '서버 응답을 확인하지 못했습니다. 로그아웃 후 다시 로그인해 계정 상태를 확인해 주세요.' : 'No response from the server. Sign out and back in to check the account status.',
    };
    return map[code] || (ko ? '회원탈퇴에 실패했습니다.' + untouched : 'Account deletion failed.' + untouched);
  }
  async function submitPcWithdraw(event) {
    event.preventDefault();
    if (pcWithdrawBusy || document.body.dataset.pcWeb !== 'true') return;
    const uid = state.session?.user?.id, password = $('#pcWithdrawPassword').value;
    if (!supabaseClient || !uid || !password || !$('#pcWithdrawAck').checked) return;
    const errEl = $('#pcWithdrawError'); errEl.hidden = true;
    pcWithdrawBusy = true; syncPcWithdrawSubmit(); $('#pcWithdrawSubmitBtn').textContent = withdrawText().busy;
    let failure = null;
    try {
      // Only the password and an explicit confirmation are sent; the server takes the user id from the verified JWT.
      const { data, error } = await supabaseClient.functions.invoke('delete-my-account', { body: { password, confirm: true } });
      if (error) {
        let code = '';
        const res = error.context;
        if (res && typeof res.json === 'function') { try { code = (await res.json())?.code || ''; } catch { } }
        if (!code) code = res && res.status === 404 ? 'NOT_DEPLOYED' : (res && res.status === 401 ? 'UNAUTHORIZED' : (error.name === 'FunctionsFetchError' ? 'NETWORK' : 'FAILED'));
        failure = code;
      } else if (data?.ok !== true) failure = data?.code || 'FAILED';
    } catch (e) { failure = 'NETWORK'; }
    pcWithdrawBusy = false; $('#pcWithdrawSubmitBtn').textContent = withdrawText().submit; syncPcWithdrawSubmit();
    $('#pcWithdrawPassword').value = ''; syncPcWithdrawSubmit();
    if (failure) { // nothing local is touched when the server did not confirm the deletion
      errEl.textContent = withdrawErrorMessage(failure); errEl.hidden = false; return;
    }
    // Server confirmed: remove this user's local caches and the session, then back to the login screen.
    try {
      clearOfflineAccessGrant(uid);
      for (const prefix of [GPS_RECORDING_STORAGE_PREFIX, GPS_PENDING_ROUTES_PREFIX, CLOUD_ROUTES_CACHE_PREFIX]) localStorage.removeItem(`${prefix}${uid}`);
      try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch { }
    } finally {
      state.session = null; state.profile = null; state.pendingUsers = [];
      closePcWithdrawModal(); closePcAccountModal(); closePcAdminModal();
      updateAuthUi(); useLocalRoutes();
      toast(state.lang === 'ko' ? '회원탈퇴가 완료되었습니다.' : 'Your account has been deleted.');
    }
  }

  function openPcAccountModal() {
    if (document.body.dataset.pcWeb !== 'true') return;
    closePcRegionModal();
    const modal = $('#pcAccountModal');
    if (modal) modal.hidden = false;
  }

  function closePcAccountModal() {
    const modal = $('#pcAccountModal');
    if (modal) modal.hidden = true;
  }

  function openPcAdminModal(tab = 'users') {
    if (!isApprovedAdmin()) {
      toast('관리자 권한이 필요합니다.');
      return;
    }
    closePcRegionModal();
    const modal = $('#pcAdminModal');
    if (!modal) return;
    modal.hidden = false;
    switchPcAdminTab(tab);
  }

  function closePcAdminModal() {
    if (adminRegionPicker) exitAdminRegionPicker(false);
    const regionsContent = $('#pcAdminRegionsSlot .admin-courses-content');
    if (regionsContent) restoreNodeToOrigin(regionsContent);
    const coursesContent = $('#pcAdminCoursesSlot .admin-courses-content');
    if (coursesContent) {
      closeAdminRoutePreview();
      restoreNodeToOrigin(coursesContent);
    }
    const modal = $('#pcAdminModal');
    if (modal) modal.hidden = true;
  }

  function switchPcAdminTab(tab) {
    if (!isApprovedAdmin()) {
      closePcAdminModal();
      return;
    }
    if (pcAdminActiveTab === 'courses' && tab !== 'courses') closeAdminRoutePreview();
    pcAdminActiveTab = ['users', 'pending', 'courses', 'regions'].includes(tab) ? tab : 'users';
    const tabs = [
      ['users', '#pcAdminTabUsers', '#pcAdminPanelUsers'],
      ['pending', '#pcAdminTabPending', '#pcAdminPanelPending'],
      ['courses', '#pcAdminTabCourses', '#pcAdminPanelCourses'],
      ['regions', '#pcAdminTabRegions', '#pcAdminPanelRegions']
    ];
    for (const [key, btnSel, panelSel] of tabs) {
      const btn = $(btnSel), panel = $(panelSel);
      const isSelected = key === pcAdminActiveTab;
      if (btn) {
        btn.classList.toggle('active', isSelected);
        btn.setAttribute('aria-selected', String(isSelected));
      }
      if (panel) panel.hidden = !isSelected;
    }
    if (pcAdminActiveTab === 'users') {
      loadAdminUsersList().then(renderPcAdminUsers);
    } else if (pcAdminActiveTab === 'pending') {
      loadPendingUsers().then(renderPcAdminPending);
    } else if (pcAdminActiveTab === 'courses') {
      // Reuse the Android admin course viewer as-is (same RPCs, search, paging, map preview, GPX download).
      const coursesContent = $('#mobileAdminCoursesView .admin-courses-content') || $('#pcAdminCoursesSlot .admin-courses-content');
      moveNodeWithOrigin(coursesContent, $('#pcAdminCoursesSlot'));
      renderAdminRoutes();
      if (adminRoutePage === 0 && !adminRouteLoading) loadAdminRoutes();
    } else if (pcAdminActiveTab === 'regions') {
      const regionsContent = $('#mobileAdminRegionsView .admin-courses-content') || $('#pcAdminRegionsSlot .admin-courses-content');
      moveNodeWithOrigin(regionsContent, $('#pcAdminRegionsSlot'));
      loadAdminRegions();
    }
  }

  function renderPcAdminUsers() {
    if (!isApprovedAdmin()) return;
    const listEl = $('#pcAdminUsersList');
    const summaryEl = $('#pcAdminUsersSummary');
    if (!listEl) return;

    const query = ($('#pcAdminUserSearch')?.value || '').trim().toLowerCase();
    const statusFilter = $('#pcAdminUserStatusFilter')?.value || 'all';

    const all = adminUsersCache || [];
    const totalCount = all.length;
    const approvedCount = all.filter(u => u.status === 'approved').length;
    const pendingCount = all.filter(u => u.status === 'pending').length;
    const rejectedCount = all.filter(u => u.status === 'rejected' || u.status === 'revoked').length;

    if (summaryEl) {
      summaryEl.innerHTML = `<span>전체 <strong>${totalCount}</strong>명</span><span>승인 완료 <strong>${approvedCount}</strong>명</span><span>승인 대기 <strong>${pendingCount}</strong>명</span><span>거절/차단 <strong>${rejectedCount}</strong>명</span>`;
    }

    const filtered = all.filter(u => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'rejected') {
          if (u.status !== 'rejected' && u.status !== 'revoked') return false;
        } else if (u.status !== statusFilter) {
          return false;
        }
      }
      if (!query) return true;
      return (u.nickname || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query);
    });

    if (!filtered.length) {
      listEl.innerHTML = '<p class="empty" style="padding:20px;text-align:center;">조건에 해당하는 회원이 없습니다.</p>';
      return;
    }

    const statusLabel = s => s === 'approved' ? '승인 완료' : s === 'pending' ? '승인 대기' : '거절/차단';
    const statusClass = s => s === 'approved' ? 'pc-status-approved' : s === 'pending' ? 'pc-status-pending' : 'pc-status-rejected';

    listEl.innerHTML = `
      <table class="pc-admin-table">
        <thead>
          <tr>
            <th>닉네임</th>
            <th>이메일</th>
            <th>승인 상태</th>
            <th>권한</th>
            <th>가입일</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(u => {
            const isSelf = u.id === state.session?.user?.id;
            const roleLabel = u.role === 'admin' ? '관리자' : '일반 회원';
            const roleClass = u.role === 'admin' ? 'pc-role-admin' : 'pc-role-member';
            const dateText = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
            const actions = isSelf
              ? '<span style="font-size:11px;color:#64748b;">본인 계정</span>'
              : u.status === 'approved'
                ? `<button type="button" class="pc-btn-reject" data-pc-user-action="reject" data-user-id="${u.id}">승인 취소</button>`
                : `<button type="button" class="pc-btn-approve" data-pc-user-action="approve" data-user-id="${u.id}">승인</button>`;
            return `
              <tr>
                <td><strong>${escapeHtml(u.nickname || '익명 라이더')}</strong></td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td><span class="pc-status-pill ${statusClass(u.status)}">${statusLabel(u.status)}</span></td>
                <td><span class="pc-role-pill ${roleClass}">${roleLabel}</span></td>
                <td>${dateText}</td>
                <td><div class="pc-admin-row-actions">${actions}</div></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderPcAdminPending() {
    if (!isApprovedAdmin()) return;
    const listEl = $('#pcAdminPendingList');
    if (!listEl) return;

    if (state.pendingUsersError) {
      listEl.innerHTML = `<div class="pending-error-notice" style="padding:12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;"><strong>조회 오류</strong>: ${escapeHtml(state.pendingUsersError)}</div>`;
      return;
    }
    const pending = state.pendingUsers || [];
    if (!pending.length) {
      listEl.innerHTML = '<p class="empty" style="padding:20px;text-align:center;">대기 중인 가입 요청이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = pending.map(u => `
      <div class="pc-admin-pending-card">
        <div>
          <strong style="display:block;font-size:14px;">${escapeHtml(u.nickname || u.email)}</strong>
          <small style="color:#64748b;font-size:12px;">${escapeHtml(u.email || '')} · ${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</small>
        </div>
        <div class="pc-admin-row-actions">
          <button type="button" class="pc-btn-approve" data-pc-user-action="approve" data-user-id="${u.id}">승인</button>
          <button type="button" class="pc-btn-reject" data-pc-user-action="reject" data-user-id="${u.id}">거절</button>
        </div>
      </div>
    `).join('');
  }

  async function handlePcAdminUserAction(e) {
    const btn = e.target.closest('[data-pc-user-action]');
    if (!btn) return;
    if (!isApprovedAdmin()) {
      toast('관리자 권한이 필요합니다.');
      return;
    }
    const userId = btn.dataset.userId;
    const action = btn.dataset.pcUserAction;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    btn.disabled = true;
    try {
      await handleSetUserStatus(userId, newStatus);
      await loadAdminUsersList();
      renderPcAdminUsers();
      renderPcAdminPending();
    } finally {
      btn.disabled = false;
    }
  }

  function initPcWebUi() {
    $('#pcAccountOpenBtn')?.addEventListener('click', openPcAccountModal);
    $('#pcAccountCloseBtn')?.addEventListener('click', closePcAccountModal);
    $('#pcAccountModal')?.addEventListener('click', e => {
      if (e.target.id === 'pcAccountModal') closePcAccountModal();
    });

    $('#pcAdminOpenBtn')?.addEventListener('click', () => openPcAdminModal('users'));
    $('#pcAdminCloseBtn')?.addEventListener('click', closePcAdminModal);
    $('#pcAdminModal')?.addEventListener('click', e => {
      if (e.target.id === 'pcAdminModal') closePcAdminModal();
    });

    $('#pcAdminTabUsers')?.addEventListener('click', () => switchPcAdminTab('users'));
    $('#pcAdminTabPending')?.addEventListener('click', () => switchPcAdminTab('pending'));
    $('#pcView2dBtn')?.addEventListener('click', () => pcSetMapView('2d'));
    $('#pcView3dBtn')?.addEventListener('click', () => pcSetMapView('3d'));
    map.on('pitchend', () => syncPcViewSwitch()); // also follows user tilt (drag) and region fly-to
    $('#pcAdminTabCourses')?.addEventListener('click', () => switchPcAdminTab('courses'));
    $('#pcAdminTabRegions')?.addEventListener('click', () => switchPcAdminTab('regions'));
    // Redraw the profile when its PC width changes (layout, panel toggle, sidebar) — not only on window resize.
    const profileWrap = $('#profilePanel .profile-chart-wrap');
    if (profileWrap && typeof ResizeObserver === 'function') {
      let lastWidth = 0;
      new ResizeObserver(entries => {
        const width = Math.round(entries[0]?.contentRect?.width || 0);
        if (document.body.dataset.pcWeb !== 'true' || !width || width === lastWidth) return;
        lastWidth = width;
        requestAnimationFrame(drawProfile);
      }).observe(profileWrap);
    }

    $('#pcAdminUserSearch')?.addEventListener('input', renderPcAdminUsers);
    $('#pcAdminUserStatusFilter')?.addEventListener('change', renderPcAdminUsers);
    $('#pcAdminUsersRefreshBtn')?.addEventListener('click', async e => {
      if (!isApprovedAdmin()) return;
      e.currentTarget.disabled = true;
      try {
        await loadAdminUsersList();
        renderPcAdminUsers();
      } finally {
        e.currentTarget.disabled = false;
      }
    });
    $('#pcAdminPendingRefreshBtn')?.addEventListener('click', async e => {
      if (!isApprovedAdmin()) return;
      e.currentTarget.disabled = true;
      try {
        await loadPendingUsers();
        renderPcAdminPending();
      } finally {
        e.currentTarget.disabled = false;
      }
    });

    $('#pcWithdrawOpenBtn')?.addEventListener('click', openPcWithdrawModal);
    $('#pcWithdrawCloseBtn')?.addEventListener('click', closePcWithdrawModal);
    $('#pcWithdrawCancelBtn')?.addEventListener('click', closePcWithdrawModal);
    $('#pcWithdrawModal')?.addEventListener('click', e => { if (e.target.id === 'pcWithdrawModal') closePcWithdrawModal(); });
    $('#pcWithdrawForm')?.addEventListener('submit', submitPcWithdraw);
    $('#pcWithdrawPassword')?.addEventListener('input', syncPcWithdrawSubmit);
    $('#pcWithdrawAck')?.addEventListener('change', syncPcWithdrawSubmit);
    $('#pcRegionCoursesCloseBtn')?.addEventListener('click', closePcRegionModal);
    $('#pcRegionCoursesModal')?.addEventListener('click', e => { if (e.target.id === 'pcRegionCoursesModal') closePcRegionModal(); });
    $('#pcAdminUsersList')?.addEventListener('click', handlePcAdminUserAction);
    $('#pcAdminPendingList')?.addEventListener('click', handlePcAdminUserAction);

    window.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#pcWithdrawModal')?.hidden) closePcWithdrawModal();
      else if (!$('#pcRegionCoursesModal')?.hidden) closePcRegionModal();
      else if (!$('#pcAccountModal')?.hidden) closePcAccountModal();
      else if (!$('#pcAdminModal')?.hidden && !adminRegionPicker) closePcAdminModal();
    });

    syncPcWebLayout(!isNativeMobileApp() && window.matchMedia('(min-width: 769px)').matches);
  }
  initPcWebUi();


  // ==========================================================================
  // Stitch Mobile Auth Controller (Screens 6b751362408f4979843ace0eca26502d / 70abe4796b054231b135cf11d270684e)
  // ==========================================================================
  function setMobileAuthView(view) {
    mobileAuthActiveView = view === 'signup' ? 'signup' : 'login';
    const isApproved = state.profile?.status === 'approved';
    if (isAuthGateEnabled() && authInitializationComplete && !isApproved) {
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
    const pcScope = isPcWebAuthScope();
    const signedIn = Boolean(state.session?.user);
    const profile = state.profile;
    // PC web requires a live server approval; the cached offline grant only applies to the existing mobile flow.
    const isApproved = (onlineAuthVerified && profile?.status === 'approved') || (offlineAccessActive && !pcScope);
    const container = $('#mobileAuthContainer');
    const checkingView = $('#mobileAuthCheckingView');
    const loginView = $('#mobileLoginView');
    const signupView = $('#mobileSignupView');

    if (pcScope) document.body.dataset.authScope = 'pc';
    else delete document.body.dataset.authScope;

    if (!isAuthGateEnabled()) {
      delete document.body.dataset.mobileAuth;
      if (container) container.hidden = true;
      return;
    }

    const introDone = introPlaybackComplete; // PC web: set only by video end / skip / playback failure (see initMobileAuthInteractions); auth results never end the intro
    if (!introDone || !authInitializationComplete) {
      document.body.dataset.mobileAuth = 'checking';
      if (container) container.hidden = false;
      if (checkingView) checkingView.hidden = false;
      checkingView?.classList.toggle('intro-finished', introDone);
      if (loginView) loginView.hidden = true;
      if (signupView) signupView.hidden = true;
      return;
    }

    // Mobile auth gating: if user is not signed in or not approved, show Stitch Auth
    if (!signedIn || !isApproved) {
      document.body.dataset.mobileAuth = mobileAuthActiveView;
      if (pcScope) {
        // Nothing from the work screen may stay open behind (or over) the PC login page.
        if ($('#pcAccountModal') && !$('#pcAccountModal').hidden && typeof closePcAccountModal === 'function') closePcAccountModal();
        if ($('#pcAdminModal') && !$('#pcAdminModal').hidden && typeof closePcAdminModal === 'function') closePcAdminModal();
        if ($('#signupModal') && !$('#signupModal').hidden && typeof closeSignupModal === 'function') closeSignupModal();
        if (offlineAccessActive && !customMessage) customMessage = '온라인 인증을 확인할 수 없습니다. 네트워크 연결 후 다시 로그인해 주세요.';
      }
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
      if (pcScope) {
        if ($('#pcAccountModal') && !$('#pcAccountModal').hidden && typeof closePcAccountModal === 'function') closePcAccountModal();
      } else if (wasGated && typeof setMobileAppView === 'function') setMobileAppView('home');
      const loginFeedback = $('#mobileLoginFeedback');
      if (loginFeedback) { loginFeedback.textContent = ''; loginFeedback.hidden = true; }
      requestAnimationFrame(() => {
        if (typeof map?.resize === 'function') map.resize();
      });
    }
  }

  function initMobileAuthInteractions() {
    const introVideo = $('#mobileIntroVideo');
    // PC web: the intro plays from the start on every document load (new visit AND reload, any login state).
    // It ends only on video 'ended', the skip button, or a real playback failure — never because auth finished.
    const pcIntro = isPcWebAuthScope();
    let introStalled = null;
    const finishIntro = () => {
      if (introPlaybackComplete) return;
      introPlaybackComplete = true;
      clearTimeout(introStalled);
      introVideo?.pause();
      syncMobileAuthState();
    };
    $('#mobileIntroSkipBtn')?.addEventListener('click', finishIntro);
    introVideo?.addEventListener('ended', finishIntro, { once: true });
    introVideo?.addEventListener('error', finishIntro, { once: true });
    // Logo fade-in follows the video clock (not wall time): hidden for 3s of playback, then 0→1 over 2s. Pause/stall freezes it.
    const appIntro = document.body.dataset.appIntro === '1'; // Android app intro (set by the inline script in index.html)
    const introLogo = $('#pcIntroLogo');
    if ((pcIntro || appIntro) && introLogo && introVideo) {
      const syncLogo = () => { introLogo.style.opacity = String(Math.max(0, Math.min(1, ((introVideo.currentTime || 0) - 3) / 2))); };
      const tickLogo = () => { if (introPlaybackComplete || introVideo.paused || introVideo.ended) return; syncLogo(); requestAnimationFrame(tickLogo); };
      syncLogo(); // start state: hidden
      ['timeupdate', 'seeked', 'pause', 'ended'].forEach(ev => introVideo.addEventListener(ev, syncLogo));
      introVideo.addEventListener('playing', tickLogo);
      if (!introVideo.paused && !introVideo.ended) tickLogo(); // already playing (event missed): smooth per-frame fade from now on
    }
    if (pcIntro) {
      // Last-resort guard only for a video that never starts: slow loading is NOT a failure, so the timer is long and is
      // re-armed whenever the browser reports loading progress; it is cancelled for good once playback starts.
      const armStall = () => { clearTimeout(introStalled); introStalled = setTimeout(finishIntro, 30000); };
      armStall();
      ['loadstart', 'progress', 'loadeddata', 'canplay', 'waiting', 'stalled'].forEach(ev => introVideo?.addEventListener(ev, () => { if (!introVideo.currentTime) armStall(); }));
      introVideo?.addEventListener('playing', () => clearTimeout(introStalled), { once: true });
    } else if (appIntro && introVideo) {
      // The video starts autoplaying as soon as index.html sets its src — usually BEFORE this script runs — so the 'playing'
      // event may already be gone. Never rely on the event alone: look at the real playback state now and on later events.
      const isPlayingNow = () => !introVideo.paused && !introVideo.ended && introVideo.readyState >= 3;
      const showVideo = () => { if (!isPlayingNow()) return false; introVideo.classList.add('intro-video-ready'); return true; }; // idempotent: no flicker
      const startedSomehow = () => !introVideo.ended && !introVideo.paused && introVideo.currentTime > 0;
      showVideo();
      ['playing', 'loadeddata', 'canplay', 'timeupdate'].forEach(ev => introVideo.addEventListener(ev, () => { if (showVideo()) clearTimeout(introStalled); }));
      // Guard for a video that never starts. A video that IS playing (even if its event was missed) is never cut off.
      const guard = () => { if (showVideo() || startedSomehow()) return; finishIntro(); };
      if (document.body.dataset.introWeb === '1') {
        // Mobile web downloads the clip over the network: slow loading is not a failure. Long guard, re-armed on progress.
        const armStall = () => { clearTimeout(introStalled); introStalled = setTimeout(guard, 30000); };
        armStall();
        ['loadstart', 'progress', 'waiting', 'stalled'].forEach(ev => introVideo.addEventListener(ev, () => { if (!introVideo.currentTime) armStall(); }));
      } else {
        introStalled = setTimeout(guard, 8000); // Android app (local asset)
      }
    }
    // play() may reject with AbortError when the element reloads (autoplay keeps going) — that is not a failure.
    if ((pcIntro && !introVideo) || introVideo?.ended || introVideo?.error) finishIntro();
    else introVideo?.play().catch(e => { if (!(pcIntro || appIntro) || e?.name !== 'AbortError') finishIntro(); });

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
        if (!state.profile) {
          activateOfflineAccess(supabaseClient, new Error('Online profile verification failed.'));
          return;
        }
        onlineAuthVerified = Boolean(state.profile);

        if (state.profile?.status !== 'approved') {
          clearOfflineAccessGrant(state.session?.user?.id);
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
        saveOfflineAccessGrant(state.session, state.profile);
        $('#mobileLoginPassword').value = '';
        if ($('#authPassword')) $('#authPassword').value = '';
        // Full sync (not just the gate): onlineAuthVerified changed after loadUserProfile's last render, so the
        // account label / admin menu must be refreshed too.
        updateAuthUi();
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
          clearOfflineAccessGrant(data.session.user?.id);
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

  function hasAdminRouteAccess() {
    return Boolean(supabaseClient && state.session?.user &&
      adminRoutesForbiddenForUser !== state.session.user.id &&
      state.profile?.role === 'admin' && state.profile?.status === 'approved');
  }

  // The admin course viewer is "open" on Android when its subview is visible (unchanged), and on PC web when the
  // admin console's 전체 코스 tab is showing. Server RPCs still enforce admin access either way.
  function isAdminRoutesViewOpen() {
    if (!$('#mobileAdminCoursesView')?.hidden) return true;
    return document.body.dataset.pcWeb === 'true' && pcAdminActiveTab === 'courses' &&
      $('#pcAdminModal')?.hidden === false && isApprovedAdmin();
  }

  function renderAdminRoutes() {
    const list = $('#stitchAdminCoursesList');
    const status = $('#stitchAdminCoursesStatus');
    const more = $('#stitchAdminCoursesMoreBtn');
    if (!list || !status || !more) return;
    const query = ($('#stitchAdminCoursesSearch')?.value || '').trim().toLocaleLowerCase();
    const matches = adminRoutes.filter(route => {
      const region = regions[route.region]?.label || route.region || '';
      return !query || [route.author_nickname, route.name, route.region, region]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
    list.innerHTML = matches.map(route => {
      const region = regions[route.region]?.label || route.region || '지역 미지정';
      const distance = route.distance_km != null && Number.isFinite(Number(route.distance_km))
        ? ` · ${Number(route.distance_km).toFixed(1)} km` : '';
      return `<article class="admin-course-item"><strong>${escapeHtml(route.name)}</strong>` +
        `<small>${escapeHtml(route.author_nickname || '작성자 미상')} · ${escapeHtml(region)}${distance}</small>` +
        `<div class="admin-course-actions"><button type="button" data-admin-route-action="map" data-route-id="${escapeHtml(route.id)}">지도 보기</button>` +
        `<button type="button" data-admin-route-action="gpx" data-route-id="${escapeHtml(route.id)}">GPX 다운로드</button></div></article>`;
    }).join('');
    if (!matches.length && !adminRouteLoading && !adminRouteLoadError) {
      list.innerHTML = '<p>표시할 코스가 없습니다.</p>';
    }
    status.classList.toggle('error', Boolean(adminRouteLoadError));
    status.textContent = adminRouteLoadError || (adminRouteLoading ? '코스를 불러오는 중입니다…' :
      query ? `검색 결과 ${matches.length}개 · 불러온 코스 ${adminRoutes.length}개` : `불러온 코스 ${adminRoutes.length}개`);
    more.hidden = !adminRouteHasMore || Boolean(query);
    more.disabled = adminRouteLoading;
  }

  function resetAdminRoutes() {
    adminRoutes = [];
    adminRoutePage = 0;
    adminRouteHasMore = true;
    adminRouteLoadError = '';
    if ($('#stitchAdminCoursesSearch')) $('#stitchAdminCoursesSearch').value = '';
    renderAdminRoutes();
  }

  async function loadAdminRoutes(loadAll = false) {
    if (adminRouteLoading || !adminRouteHasMore || !hasAdminRouteAccess() || !isAdminRoutesViewOpen()) return;
    const client = supabaseClient;
    const userId = state.session.user.id;
    adminRouteLoading = true;
    adminRouteLoadError = '';
    renderAdminRoutes();
    try {
      do {
        const { data, error } = await client.rpc('list_admin_all_routes', {
          page_number: adminRoutePage + 1, page_size: adminRoutePageSize
        });
        if (error) throw error;
        if (client !== supabaseClient || state.session?.user?.id !== userId || !hasAdminRouteAccess()) return;
        const rows = Array.isArray(data) ? data : [];
        // Keep only list metadata here. Route points are fetched on demand.
        adminRoutes.push(...rows.map(({ id, user_id, name, region, distance_km, created_at, author_nickname }) =>
          ({ id, user_id, name, region, distance_km, created_at, author_nickname })));
        adminRoutePage++;
        adminRouteHasMore = rows.length === adminRoutePageSize;
        renderAdminRoutes();
      } while (loadAll && adminRouteHasMore && isAdminRoutesViewOpen() && $('#stitchAdminCoursesSearch')?.value.trim());
    } catch (error) {
      if (error?.code === '42501' || /administrator access required|permission denied/i.test(error?.message || '')) {
        adminRoutesForbiddenForUser = userId;
        resetAdminRoutes();
        setStitchAccountSubView('adminManage');
        syncStitchAccountUI();
        toast('관리자 코스 조회 권한이 없습니다.');
      } else {
        adminRouteLoadError = `코스 조회 실패: ${error?.message || '다시 시도해 주세요.'}`;
      }
    } finally {
      adminRouteLoading = false;
      renderAdminRoutes();
      if (!adminRouteLoadError && adminRouteHasMore && isAdminRoutesViewOpen() && $('#stitchAdminCoursesSearch')?.value.trim()) {
        loadAdminRoutes(true);
      }
    }
  }

  function closeAdminRoutePreview() {
    adminRoutePreviewRequest++;
    const preview = $('#stitchAdminCoursePreview');
    if (preview) preview.hidden = true;
    adminRoutePreviewMap?.getSource('admin-route-preview')?.setData({
      type: 'FeatureCollection', features: []
    });
  }

  function showAdminRoutePreview(route) {
    const points = route.points.filter(point => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng ?? point?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    }).map(point => [Number(point.lng ?? point.lon), Number(point.lat)]);
    if (points.length < 2) throw new Error('지도에 표시할 코스 좌표가 부족합니다.');
    const preview = $('#stitchAdminCoursePreview');
    $('#stitchAdminCoursePreviewTitle').textContent = route.name || '코스 미리보기';
    preview.hidden = false;
    if (!adminRoutePreviewMap) {
      adminRoutePreviewMap = new mapboxgl.Map({
        container: 'stitchAdminCoursePreviewMap',
        style: hasMapboxToken ? MAPBOX_STYLES.satellite : tokenFallbackStyle,
        center: points[0], zoom: 11, interactive: true
      });
    }
    const previewRequest = adminRoutePreviewRequest;
    const drawPreview = () => {
      if (preview.hidden || previewRequest !== adminRoutePreviewRequest) return;
      const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: {} };
      if (!adminRoutePreviewMap.getSource('admin-route-preview')) {
        adminRoutePreviewMap.addSource('admin-route-preview', { type: 'geojson', data });
        adminRoutePreviewMap.addLayer({ id: 'admin-route-preview-line', type: 'line', source: 'admin-route-preview',
          paint: { 'line-color': '#38bdf8', 'line-width': 4 } });
      } else {
        adminRoutePreviewMap.getSource('admin-route-preview').setData(data);
      }
      const bounds = points.reduce((box, point) => box.extend(point), new mapboxgl.LngLatBounds(points[0], points[0]));
      adminRoutePreviewMap.resize();
      adminRoutePreviewMap.fitBounds(bounds, { padding: 35, maxZoom: 14, duration: 500 });
    };
    if (adminRoutePreviewMap.isStyleLoaded()) drawPreview();
    else adminRoutePreviewMap.once('load', drawPreview);
    preview.scrollIntoView({ block: 'nearest' });
  }

  async function openAdminRoute(routeId, action, button) {
    if (!hasAdminRouteAccess() || !adminRoutes.some(route => route.id === routeId)) return;
    const client = supabaseClient;
    const userId = state.session.user.id;
    const requestId = action === 'map' ? ++adminRoutePreviewRequest : null;
    button.disabled = true;
    try {
      const { data, error } = await client.rpc('get_admin_route_points', { route_id: routeId }).single();
      if (error) throw error;
      if (client !== supabaseClient || state.session?.user?.id !== userId || !hasAdminRouteAccess() ||
          !isAdminRoutesViewOpen() || (action === 'map' && requestId !== adminRoutePreviewRequest)) return;
      if (!data || !Array.isArray(data.points) || data.id !== routeId) throw new Error('코스 좌표를 불러올 수 없습니다.');
      if (action === 'map') {
        showAdminRoutePreview(data);
      } else {
        const xml = gpxString({ name: data.name, points: data.points });
        if (!xml) throw new Error('GPX로 내보낼 코스 좌표가 부족합니다.');
        const adminGpxName = ((data.name || 'powderline-route').trim().replace(/[/\\?%*:|"<>]/g, '-') || 'powderline-route') + '.gpx';
        if (getGpxFileSaverPlugin()) {
          const result = await saveGpxWithNativeSaver(xml, adminGpxName);
          if (result?.saved === true) toast(t('toastExportedGpx'));
        } else {
          const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' }));
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = adminGpxName;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }
      adminRouteLoadError = '';
      renderAdminRoutes();
    } catch (error) {
      if (error?.code === '42501' || /administrator access required|permission denied/i.test(error?.message || '')) {
        adminRoutesForbiddenForUser = userId;
        resetAdminRoutes();
        setStitchAccountSubView('adminManage');
        syncStitchAccountUI();
        toast('관리자 코스 조회 권한이 없습니다.');
      } else {
        adminRouteLoadError = `${action === 'map' ? '지도 보기' : 'GPX 다운로드'} 실패: ${error?.message || '다시 시도해 주세요.'}`;
        renderAdminRoutes();
      }
    } finally {
      button.disabled = false;
    }
  }

  function hasAdminRegionAccess() {
    return Boolean(supabaseClient && state.session?.user &&
      state.profile?.role === 'admin' && state.profile?.status === 'approved' &&
      adminRegionsForbiddenForUser !== state.session.user.id);
  }

  function showAdminRegionError(error, target = $('#stitchAdminRegionsStatus')) {
    if (['42501', 'PGRST116'].includes(error?.code) || [401, 403].includes(error?.status) ||
        /permission denied|row-level security/i.test(error?.message || '')) {
      adminRegionsForbiddenForUser = state.session?.user?.id;
      adminRegionRows = [];
      setStitchAccountSubView('adminManage');
      syncStitchAccountUI();
      toast('지역 관리 권한이 없습니다.');
      return;
    }
    if (target) {
      target.classList.add('error');
      target.textContent = error?.message || '지역 정보를 처리하지 못했습니다.';
    }
  }

  function renderAdminRegions() {
    const list = $('#stitchAdminRegionsList');
    const status = $('#stitchAdminRegionsStatus');
    if (!list || !status) return;
    list.innerHTML = adminRegionRows.map(row => {
      const builtIn = builtInRegionIds.has(row.id);
      const stateLabel = row.is_active ? '활성' : '비활성';
      const skiDataLabel = ({ not_requested: '데이터 요청 없음', pending: '데이터 준비 대기', processing: '데이터 준비 중', ready: '데이터 준비 완료', empty: '조회 완료 · 데이터 없음', failed: '데이터 준비 실패' })[row.ski_data_status] || row.ski_data_status;
      return `<article class="admin-course-item"><strong>${escapeHtml(row.label)} · ${escapeHtml(row.id)}</strong>` +
        `<small>${stateLabel} · ${Number(row.center_lng).toFixed(3)}, ${Number(row.center_lat).toFixed(3)} · zoom ${Number(row.zoom)}</small>` +
        `<small>${escapeHtml(skiDataLabel || '데이터 상태 미확인')}${row.ski_data_feature_count != null ? ` · ${Number(row.ski_data_feature_count)}개` : ''}${escapeHtml(adminSkiDataTiming(row))}</small>` +
        (row.ski_data_status === 'failed' && row.ski_data_error ? `<small>${escapeHtml(row.ski_data_error)}</small>` : '') +
        `<div class="admin-course-actions"><button type="button" data-admin-region-action="edit" data-region-id="${escapeHtml(row.id)}">수정</button>` +
        (builtIn ? '<small>기본 지역 · 비활성화 불가</small>' :
          `<button type="button" data-admin-region-action="toggle" data-region-id="${escapeHtml(row.id)}">${row.is_active ? '비활성화' : '활성화'}</button>`) +
        '</div></article>';
    }).join('') || '<p>등록된 지역이 없습니다.</p>';
    status.classList.remove('error');
    status.textContent = `${adminRegionRows.length}개 지역`;
    scheduleAdminRegionStatusPoll();
  }
  // "Waiting" is shown with its real age; GitHub's scheduled runs can be delayed by hours.
  function adminSkiDataTiming(row) {
    const since = row.ski_data_status === 'processing' ? row.ski_data_started_at : row.ski_data_status === 'pending' ? row.ski_data_requested_at : null;
    if (!since) return '';
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 60000));
    const age = minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
    const late = row.ski_data_status === 'pending' && minutes >= 90 ? ' · 예약 수집 실행 지연 중' : '';
    return ` · 요청 후 ${age} 경과${late}`;
  }
  // While anything is pending/processing and the region admin is open, re-read the DB so the list follows the batch.
  let adminRegionPollTimer = null;
  function scheduleAdminRegionStatusPoll() {
    clearTimeout(adminRegionPollTimer);
    const waiting = adminRegionRows.some(row => ['pending', 'processing'].includes(row.ski_data_status));
    if (!waiting) return;
    adminRegionPollTimer = setTimeout(() => {
      const view = $('#mobileAdminRegionsView');
      const open = view && !view.hidden && !document.hidden;
      if (open && supabaseClient && navigator.onLine !== false) void loadAdminRegions();
      else scheduleAdminRegionStatusPoll();
    }, 60000);
  }

  async function loadAdminRegions() {
    if (!hasAdminRegionAccess()) return;
    const status = $('#stitchAdminRegionsStatus');
    status.classList.remove('error');
    status.textContent = '지역 목록을 불러오는 중입니다…';
    const client = supabaseClient;
    const { data: allowed, error: permissionError } = await client.rpc('is_admin');
    if (client !== supabaseClient) return;
    if (permissionError || !allowed) {
      showAdminRegionError(permissionError || { code: '42501' }, status);
      return;
    }
    const { error } = await loadRegionCatalog(client);
    if (error) showAdminRegionError(error, status);
    else {
      renderAdminRegions();
      const form = $('#stitchAdminRegionForm');
      const idInput = form?.elements.namedItem('id');
      if (idInput && !form.dataset.editId && !idInput.value) idInput.value = generateRegionId();
    }
  }

  const REGION_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
  const REGION_TEXT_MAX = 30;
  // Auto ID: "region_" + 8 base36 chars (15 chars, matches the existing id rule), unique against known regions.
  function generateRegionId(existingIds = new Set([...adminRegionRows.map(row => row.id), ...catalogRegionIds, ...builtInRegionIds])) {
    for (let attempt = 0; attempt < 50; attempt++) {
      let suffix = '';
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      for (const byte of bytes) suffix += (byte % 36).toString(36);
      const id = `region_${suffix}`;
      if (!existingIds.has(id)) return id;
    }
    return `region_${Date.now().toString(36)}`.slice(0, REGION_TEXT_MAX);
  }
  function bboxEquals(a, b) {
    if (!a || !b) return !a && !b;
    return a.length === 4 && b.length === 4 && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  }

  function resetAdminRegionForm(row = null) {
    const form = $('#stitchAdminRegionForm');
    form.reset();
    form.dataset.editId = row?.id || '';
    form.elements.namedItem('id').value = row?.id || generateRegionId();
    form.elements.namedItem('id').disabled = Boolean(row);
    for (const name of ['label', 'center_lng', 'center_lat', 'zoom', 'bearing', 'pitch']) {
      if (row) form.elements.namedItem(name).value = row[name];
    }
    const rowBbox = parseRegionBbox(row?.bbox);
    for (const [index, name] of ['west', 'south', 'east', 'north'].entries()) {
      form.elements.namedItem(name).value = rowBbox?.[index] ?? '';
    }
    $('#stitchAdminRegionFormTitle').textContent = row ? `지역 수정 · ${row.label}` : '지역 추가';
    $('#stitchAdminRegionFormError').textContent = '';
    if (row) form.scrollIntoView({ block: 'nearest' });
  }

  function drawAdminRegionBbox() {
    if (!map.isStyleLoaded()) return;
    const bbox = adminRegionPicker?.bbox;
    const ring = bbox ? [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]],
      [bbox[0], bbox[3]], [bbox[0], bbox[1]]] : null;
    const data = { type: 'FeatureCollection', features: ring ? [{
      type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {}
    }] : [] };
    if (!map.getSource('admin-region-bbox')) {
      map.addSource('admin-region-bbox', { type: 'geojson', data });
    } else {
      map.getSource('admin-region-bbox').setData(data);
    }
    if (!map.getLayer('admin-region-bbox-fill')) {
      map.addLayer({ id: 'admin-region-bbox-fill', type: 'fill', source: 'admin-region-bbox',
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': .18 } });
    }
    if (!map.getLayer('admin-region-bbox-line')) {
      map.addLayer({ id: 'admin-region-bbox-line', type: 'line', source: 'admin-region-bbox',
        paint: { 'line-color': '#38bdf8', 'line-width': 3 } });
    }
    const handles = { type: 'FeatureCollection', features: bbox ? adminBboxHandles(bbox).map(h => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: h.lngLat }, properties: {} })) : [] };
    if (!map.getSource('admin-region-bbox-handles')) {
      map.addSource('admin-region-bbox-handles', { type: 'geojson', data: handles });
    } else {
      map.getSource('admin-region-bbox-handles').setData(handles);
    }
    if (!map.getLayer('admin-region-bbox-handles')) {
      map.addLayer({ id: 'admin-region-bbox-handles', type: 'circle', source: 'admin-region-bbox-handles',
        paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': '#0284c7', 'circle-stroke-width': 3 } });
    }
  }

  // ---- Rectangle editing: 4 corner handles, 4 edge-middle handles, drag inside to move. ----
  // hx/hy: -1 = west/south edge, +1 = east/north edge, 0 = this axis is untouched.
  function adminBboxHandles(bbox) {
    const cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
    return [
      { hx: -1, hy: -1, lngLat: [bbox[0], bbox[1]] }, { hx: 1, hy: -1, lngLat: [bbox[2], bbox[1]] },
      { hx: 1, hy: 1, lngLat: [bbox[2], bbox[3]] }, { hx: -1, hy: 1, lngLat: [bbox[0], bbox[3]] },
      { hx: 0, hy: -1, lngLat: [cx, bbox[1]] }, { hx: 1, hy: 0, lngLat: [bbox[2], cy] },
      { hx: 0, hy: 1, lngLat: [cx, bbox[3]] }, { hx: -1, hy: 0, lngLat: [bbox[0], cy] }
    ];
  }
  // Pure: new bbox for a handle drag / a whole-box move. Keeps west<east, south<north (minimum size) and valid latitudes.
  function adminBboxAfterDrag(start, drag, lngLat) {
    const MIN = 1e-5;
    const lat = value => Math.max(-85, Math.min(85, value));
    if (drag.mode === 'move') {
      const dLng = lngLat[0] - drag.startLngLat[0];
      let dLat = lngLat[1] - drag.startLngLat[1];
      dLat = Math.max(-85 - start[1], Math.min(85 - start[3], dLat));
      return [start[0] + dLng, start[1] + dLat, start[2] + dLng, start[3] + dLat];
    }
    const next = start.slice();
    if (drag.hx < 0) next[0] = Math.min(lngLat[0], start[2] - MIN); else if (drag.hx > 0) next[2] = Math.max(lngLat[0], start[0] + MIN);
    if (drag.hy < 0) next[1] = Math.min(lat(lngLat[1]), start[3] - MIN); else if (drag.hy > 0) next[3] = Math.max(lat(lngLat[1]), start[1] + MIN);
    return next;
  }
  function adminBboxHit(picker, point, lngLat, touch) {
    if (!picker?.bbox || picker.pickingBbox || picker.firstCorner) return null;
    const reach = touch ? 24 : 14;
    let best = null, bestDistance = reach;
    for (const handle of adminBboxHandles(picker.bbox)) {
      const px = map.project(handle.lngLat);
      const distance = Math.hypot(px.x - point.x, px.y - point.y);
      if (distance <= bestDistance) { best = { mode: 'handle', hx: handle.hx, hy: handle.hy }; bestDistance = distance; }
    }
    if (best) return best;
    const b = picker.bbox;
    return lngLat.lng >= b[0] && lngLat.lng <= b[2] && lngLat.lat >= b[1] && lngLat.lat <= b[3] ? { mode: 'move' } : null;
  }
  function adminBboxText(bbox) { return `W ${bbox[0].toFixed(6)} · S ${bbox[1].toFixed(6)} · E ${bbox[2].toFixed(6)} · N ${bbox[3].toFixed(6)}`; }
  function startAdminBboxDrag(event, touch) {
    const picker = adminRegionPicker;
    if (!picker || picker.drag) return;
    if (touch && event.originalEvent?.touches && event.originalEvent.touches.length > 1) return; // pinch stays a map gesture
    const hit = adminBboxHit(picker, event.point, event.lngLat, touch);
    if (!hit) return;
    event.preventDefault();
    map.dragPan.disable(); // the map must not pan while the rectangle is edited
    picker.drag = { ...hit, startLngLat: [event.lngLat.lng, event.lngLat.lat], startBbox: picker.bbox.slice() };
  }
  function moveAdminBboxDrag(event) {
    const picker = adminRegionPicker;
    if (!picker?.drag) {
      if (picker && !event.originalEvent?.touches) { // hover cursor hint (desktop)
        const hit = adminBboxHit(picker, event.point, event.lngLat, false);
        map.getCanvas().style.cursor = hit ? (hit.mode === 'move' ? 'move' : 'pointer') : '';
      }
      return;
    }
    picker.bbox = adminBboxAfterDrag(picker.drag.startBbox, picker.drag, [event.lngLat.lng, event.lngLat.lat]);
    drawAdminRegionBbox();
    $('#adminRegionPickerStatus').textContent = adminBboxText(picker.bbox);
  }
  function endAdminBboxDrag() {
    const picker = adminRegionPicker;
    if (!picker?.drag) return;
    picker.drag = null;
    map.dragPan.enable();
    for (const [index, name] of ['west', 'south', 'east', 'north'].entries()) {
      $('#stitchAdminRegionForm').elements.namedItem(name).value = picker.bbox[index].toFixed(6);
    }
    $('#adminRegionPickerStatus').textContent = adminBboxText(picker.bbox) + ' — 폼에 반영했습니다. 적용 후 저장하세요.';
  }
  map.on('mousedown', event => startAdminBboxDrag(event, false));
  map.on('touchstart', event => startAdminBboxDrag(event, true));
  map.on('mousemove', moveAdminBboxDrag);
  map.on('touchmove', moveAdminBboxDrag);
  map.on('mouseup', endAdminBboxDrag);
  map.on('touchend', endAdminBboxDrag);
  map.on('touchcancel', endAdminBboxDrag);
  window.addEventListener('mouseup', endAdminBboxDrag); // released outside the map canvas
  window.addEventListener('touchend', endAdminBboxDrag);

  function enterAdminRegionPicker() {
    if (!hasAdminRegionAccess() || adminRegionPicker) return;
    const form = $('#stitchAdminRegionForm');
    const names = ['center_lng', 'center_lat', 'zoom', 'bearing', 'pitch', 'west', 'south', 'east', 'north'];
    const snapshot = Object.fromEntries(names.map(name => [name, form.elements.namedItem(name).value]));
    const bboxValues = ['west', 'south', 'east', 'north'].map(name => snapshot[name]);
    const bbox = bboxValues.every(value => value !== '') ? bboxValues.map(Number) : null;
    adminRegionPicker = {
      snapshot,
      camera: { center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
      bbox: bbox && bbox[0] < bbox[2] && bbox[1] < bbox[3] ? bbox : null,
      pickingBbox: false,
      firstCorner: null
    };
    $('#adminRegionMapPicker').hidden = false;
    document.body.classList.add('admin-region-picking');
    $('#adminRegionPickerStatus').textContent = '지도를 이동한 뒤 중심을 지정하거나 범위의 두 모서리를 클릭·터치하세요.';
    $('#adminRegionPickBboxBtn').setAttribute('aria-pressed', 'false');
    setMobileAppView('map');
    const lng = Number(snapshot.center_lng), lat = Number(snapshot.center_lat);
    if (snapshot.center_lng !== '' && snapshot.center_lat !== '' &&
        Number.isFinite(lng) && Number.isFinite(lat)) {
      map.jumpTo({ center: [lng, lat], zoom: Number(snapshot.zoom),
        bearing: Number(snapshot.bearing), pitch: Number(snapshot.pitch) });
    }
    requestAnimationFrame(() => { map.resize(); drawAdminRegionBbox(); });
  }

  function exitAdminRegionPicker(apply) {
    const picker = adminRegionPicker;
    if (!picker) return;
    const form = $('#stitchAdminRegionForm');
    if (!apply) {
      for (const [name, value] of Object.entries(picker.snapshot)) form.elements.namedItem(name).value = value;
      map.jumpTo(picker.camera);
    }
    if (picker.drag) map.dragPan.enable();
    adminRegionPicker = null;
    map.getCanvas().style.cursor = '';
    $('#adminRegionMapPicker').hidden = true;
    document.body.classList.remove('admin-region-picking');
    $('#adminRegionPickBboxBtn').setAttribute('aria-pressed', 'false');
    drawAdminRegionBbox();
    if (document.body.dataset.pcWeb === 'true') {
      if (typeof openPcAdminModal === 'function') openPcAdminModal('regions');
    } else {
      setMobileAppView('account');
      setStitchAccountSubView('adminRegions');
    }
    if (apply) toast('지정한 위치·범위가 폼에 반영되었습니다. 저장 버튼을 눌러 완료하세요.');
  }

  function openDesktopAdminRegions() {
    if (!window.matchMedia('(min-width: 769px)').matches || !hasAdminRegionAccess()) return;
    const accountScreen = $('#mobileAccountScreen');
    if (!accountScreen) return;
    document.body.classList.add('desktop-admin-regions-open');
    accountScreen.hidden = false;
    setStitchAccountSubView('adminRegions');
    syncStitchAccountUI();
  }

  function closeDesktopAdminRegions() {
    if (!document.body.classList.contains('desktop-admin-regions-open')) return;
    if (adminRegionPicker) exitAdminRegionPicker(false);
    document.body.classList.remove('desktop-admin-regions-open');
    const accountScreen = $('#mobileAccountScreen');
    if (accountScreen) accountScreen.hidden = true;
  }

  function pickAdminRegionCenter() {
    if (!adminRegionPicker) return;
    const form = $('#stitchAdminRegionForm');
    const center = map.getCenter();
    const lng = ((center.lng + 180) % 360 + 360) % 360 - 180;
    const values = {
      center_lng: lng.toFixed(6), center_lat: center.lat.toFixed(6),
      zoom: Math.min(22, map.getZoom()).toFixed(2),
      bearing: map.getBearing().toFixed(2), pitch: Math.min(75, map.getPitch()).toFixed(2)
    };
    for (const [name, value] of Object.entries(values)) form.elements.namedItem(name).value = value;
    $('#adminRegionPickerStatus').textContent = `중심 지정: ${values.center_lng}, ${values.center_lat}`;
  }

  map.on('click', event => {
    const picker = adminRegionPicker;
    if (!picker?.pickingBbox) return;
    const lng = ((event.lngLat.lng + 180) % 360 + 360) % 360 - 180;
    const corner = [lng, event.lngLat.lat];
    if (!picker.firstCorner) {
      picker.firstCorner = corner;
      $('#adminRegionPickerStatus').textContent = '첫 번째 모서리를 지정했습니다. 두 번째 모서리를 클릭·터치하세요.';
      return;
    }
    const first = picker.firstCorner;
    picker.firstCorner = null;
    const bbox = [Math.min(first[0], corner[0]), Math.min(first[1], corner[1]),
      Math.max(first[0], corner[0]), Math.max(first[1], corner[1])];
    if (bbox[0] === bbox[2] || bbox[1] === bbox[3]) {
      $('#adminRegionPickerStatus').textContent = '서로 다른 두 모서리를 선택해 주세요.';
      return;
    }
    picker.bbox = bbox;
    picker.pickingBbox = false;
    $('#adminRegionPickBboxBtn').setAttribute('aria-pressed', 'false');
    for (const [index, name] of ['west', 'south', 'east', 'north'].entries()) {
      $('#stitchAdminRegionForm').elements.namedItem(name).value = bbox[index].toFixed(6);
    }
    drawAdminRegionBbox();
    $('#adminRegionPickerStatus').textContent = '범위를 표시했습니다. 모서리·변 중앙 핸들로 크기를, 사각형 안쪽을 끌어 위치를 조정할 수 있습니다.';
  });
  map.on('style.load', () => { if (adminRegionPicker) drawAdminRegionBbox(); });

  async function saveAdminRegion(event) {
    event.preventDefault();
    if (!hasAdminRegionAccess()) return;
    const form = event.currentTarget;
    const errorEl = $('#stitchAdminRegionFormError');
    errorEl.textContent = '';
    const editId = form.dataset.editId || '';
    const value = name => form.elements.namedItem(name).value.trim();
    const bboxFields = ['west', 'south', 'east', 'north'].map(value);
    const bboxPresent = bboxFields.filter(Boolean).length;
    if (bboxPresent && bboxPresent !== 4) {
      errorEl.textContent = 'bbox는 네 좌표를 모두 입력해 주세요.';
      return;
    }
    const bbox = bboxPresent ? bboxFields.map(Number) : null;
    if (bbox && !(bbox[0] < bbox[2] && bbox[1] < bbox[3])) {
      errorEl.textContent = 'bbox는 west < east, south < north 순서여야 합니다.';
      return;
    }
    if (bbox && (bbox[1] < -85 || bbox[3] > 85)) {
      errorEl.textContent = 'bbox 위도는 -85도 이상 85도 이하여야 합니다.';
      return;
    }
    if (bbox && (bbox[2] - bbox[0] > 0.5 || bbox[3] - bbox[1] > 0.5 ||
        (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.05)) {
      errorEl.textContent = 'bbox는 가로·세로 0.5도 이하, 면적 0.05 제곱도 이하여야 합니다.';
      return;
    }
    const centerLng = Number(value('center_lng'));
    const centerLat = Number(value('center_lat'));
    if (!Number.isFinite(centerLng) || !Number.isFinite(centerLat)) {
      errorEl.textContent = '지역 중심점 좌표를 올바르게 입력해 주세요.';
      return;
    }
    if (bbox && (centerLng < bbox[0] || centerLng > bbox[2] || centerLat < bbox[1] || centerLat > bbox[3])) {
      errorEl.textContent = '지역 중심점은 bbox 내부에 있어야 합니다.';
      return;
    }
    const label = value('label');
    if (!label || [...label].length > REGION_TEXT_MAX) {
      errorEl.textContent = `지역명은 1~${REGION_TEXT_MAX}자로 입력해 주세요.`;
      return;
    }
    const newId = editId ? '' : (value('id') || generateRegionId());
    if (!editId) {
      if (newId.length > REGION_TEXT_MAX || !REGION_ID_PATTERN.test(newId)) {
        errorEl.textContent = `지역 ID는 영문 소문자로 시작하는 소문자·숫자·밑줄 ${REGION_TEXT_MAX}자 이하여야 합니다.`;
        return;
      }
      if (adminRegionRows.some(row => row.id === newId) || catalogRegionIds.has(newId) || builtInRegionIds.has(newId)) {
        errorEl.textContent = '이미 사용 중인 지역 ID입니다.';
        return;
      }
    }
    const payload = {
      label, center_lng: centerLng,
      center_lat: centerLat, zoom: Number(value('zoom')),
      bearing: Number(value('bearing')), pitch: Number(value('pitch'))
    };
    const previousRegion = adminRegionRows.find(row => row.id === editId);
    const previousBbox = parseRegionBbox(previousRegion?.bbox);
    const bboxChanged = !editId || !bboxEquals(previousBbox, bbox);
    // Only send bbox when it changed, so metadata-only edits never touch ski_data_status / offline_data_version.
    if (bboxChanged) payload.bbox = bbox;
    if (!editId) {
      payload.id = newId;
      payload.sort_order = Math.max(0, ...adminRegionRows.map(row => Number(row.sort_order) || 0)) + 1;
    }
    const shouldPrepareSkiData = Boolean(bbox && (bboxChanged ||
      ['pending', 'failed'].includes(previousRegion?.ski_data_status)));
    const savedRegionId = editId || payload.id;
    const button = $('#stitchAdminRegionSaveBtn');
    button.disabled = true;
    try {
      const query = editId
        ? supabaseClient.from('powderline_regions').update(payload).eq('id', editId)
        : supabaseClient.from('powderline_regions').insert(payload);
      const { error } = await query.select('id').single();
      if (error) throw error;
      resetAdminRegionForm();
      await loadAdminRegions();
      const status = $('#stitchAdminRegionsStatus');
      if (!shouldPrepareSkiData) {
        status.textContent = '지역 저장 완료 · 스키 데이터 준비 요청 없음';
        return;
      }
      // The DB trigger has already set ski_data_status to 'pending'. Ask the server to start the OpenSkiData run for
      // this region now (Edge Function holds the GitHub token). If that fails the region simply stays pending and the
      // hourly scheduled run collects it.
      if (!bboxChanged) {
        status.textContent = '지역 저장 완료 · 이전 수집이 실패한 지역입니다 (일정 시간 후 자동 재시도)';
        return;
      }
      status.textContent = '지역 저장 완료 · 스키 데이터 수집을 요청하는 중…';
      const requested = await requestRegionSkiDataIngest(savedRegionId);
      status.textContent = requested === 'dispatched' ? '지역 저장 완료 · 스키 데이터 수집을 시작했습니다 (완료까지 수 분)'
        : requested === 'running' ? '지역 저장 완료 · 이 지역은 이미 수집 중입니다'
        : '지역 저장 완료 · 자동 수집 요청에 실패해 대기 상태로 두었습니다 (최대 약 1시간 내 예약 수집)';
      void loadAdminRegions();
    } catch (error) {
      showAdminRegionError(error, errorEl);
    } finally {
      button.disabled = false;
    }
  }

  // Never throws and never changes the saved region: any failure just leaves it `pending` for the scheduled run.
  async function requestRegionSkiDataIngest(regionId) {
    try {
      if (!supabaseClient?.functions?.invoke || navigator.onLine === false) return 'failed';
      const { data, error } = await supabaseClient.functions.invoke('dispatch-region-ingest', { body: { regionId } });
      if (error) return 'failed';
      if (data?.dispatched === true) return 'dispatched';
      return data?.reason === 'already-processing' ? 'running' : 'failed';
    } catch (error) {
      console.warn('Region ingest request failed:', error);
      return 'failed';
    }
  }

  async function toggleAdminRegion(id) {
    if (!hasAdminRegionAccess() || builtInRegionIds.has(id)) return;
    const row = adminRegionRows.find(item => item.id === id);
    if (!row) return;
    try {
      const { error } = await supabaseClient.from('powderline_regions')
        .update({ is_active: !row.is_active }).eq('id', id).select('id').single();
      if (error) throw error;
      await loadAdminRegions();
    } catch (error) {
      showAdminRegionError(error);
    }
  }

  function setStitchAccountSubView(subview) {
    const mainView = $('#mobileAccountMainView');
    const adminManageView = $('#mobileAdminManageView');
    const adminUsersView = $('#mobileAdminUsersView');
    const adminCoursesView = $('#mobileAdminCoursesView');
    const adminRegionsView = $('#mobileAdminRegionsView');
    const deleteView = $('#mobileDeleteAccountView');
    const isAdmin = state.profile?.role === 'admin' && state.profile?.status === 'approved';
    const nextSubview = (!isAdmin && (subview === 'adminManage' || subview === 'adminUsers' || subview === 'adminCourses' || subview === 'adminRegions')) ? 'main' : subview;

    if (nextSubview !== 'adminCourses') closeAdminRoutePreview();
    if (mainView) mainView.hidden = nextSubview !== 'main';
    if (adminManageView) adminManageView.hidden = nextSubview !== 'adminManage';
    if (adminUsersView) adminUsersView.hidden = nextSubview !== 'adminUsers';
    if (adminCoursesView) adminCoursesView.hidden = nextSubview !== 'adminCourses';
    if (adminRegionsView) adminRegionsView.hidden = nextSubview !== 'adminRegions';
    if (deleteView) deleteView.hidden = nextSubview !== 'deleteAccount';

    if (nextSubview === 'adminManage') {
      loadPendingUsers();
    } else if (nextSubview === 'adminUsers') {
      switchAdminTab(currentAdminTab); // tabs/sections always consistent when the screen opens
      loadAdminUsersList();
    } else if (nextSubview === 'adminCourses' && adminRoutePage === 0 && !adminRouteLoading) {
      loadAdminRoutes();
    } else if (nextSubview === 'adminRegions') {
      loadAdminRegions();
    } else if (nextSubview === 'deleteAccount') {
      resetDeleteAccountView();
    }
  }

  function syncStitchAccountUI() {
    const profile = state.profile;
    const user = state.session?.user;
    const isApproved = profile?.status === 'approved';
    const isAdmin = isApproved && profile?.role === 'admin';

    const nickEl = $('#stitchAccountNickname');
    const emailEl = $('#stitchAccountEmail');
    const approvedBadge = $('#stitchAccountApprovedBadge');
    const adminBadge = $('#stitchAccountAdminBadge');
    const adminConsole = $('#stitchAdminConsoleSection');
    const pendingCountBadge = $('#stitchAdminPendingCountBadge');
    const managePendingBadge = $('#stitchAdminManagePendingBadge');

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
    const adminCoursesMenu = $('#stitchOpenAdminCoursesBtn');
    if (adminCoursesMenu) adminCoursesMenu.hidden = !isAdmin || adminRoutesForbiddenForUser === user?.id;
    const adminRegionsMenu = $('#stitchOpenAdminRegionsBtn');
    if (adminRegionsMenu) adminRegionsMenu.hidden = !isAdmin || adminRegionsForbiddenForUser === user?.id;
    if (!isAdmin && adminRegionPicker) exitAdminRegionPicker(false);
    if (!isAdmin) closeDesktopAdminRegions();
    if (!isAdmin) adminRegionRows = [];
    if (!isAdmin && adminRoutes.length) resetAdminRoutes();
    if (!isAdmin && (!$('#mobileAdminCoursesView')?.hidden || !$('#mobileAdminRegionsView')?.hidden)) setStitchAccountSubView('main');

    const count = state.pendingUsers ? state.pendingUsers.length : 0;
    if (pendingCountBadge) {
      pendingCountBadge.textContent = `대기 ${count}명`;
    }
    if (managePendingBadge) {
      managePendingBadge.textContent = `대기 ${count}명`;
    }

  }

  async function loadAdminUsersList() {
    if (!supabaseClient || state.profile?.role !== 'admin' || state.profile?.status !== 'approved') return;
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
          listEl.innerHTML = '<div class="text-center py-6 text-outline font-body-sm">거절되거나 차단된 회원이 없습니다.<br>탈퇴한(삭제된) 계정은 목록에 없으며 재승인할 수 없습니다.</div>';
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
    for (const t of ['pending', 'approved', 'revoked']) {
      const btn = $('#stitchTab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) { btn.classList.toggle('active', t === type); btn.setAttribute('aria-pressed', String(t === type)); } // look comes from .admin-tab-card (dark card, teal when active)
    }

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

    $('#stitchOpenAdminManageBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('adminManage');
    });

    $('#stitchAdminManageBackBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('main');
    });

    $('#stitchAdminManageHeaderBackBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('main');
    });

    $('#stitchOpenAdminUsersBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('adminUsers');
    });

    $('#stitchOpenAdminCoursesBtn')?.addEventListener('click', () => {
      if (!hasAdminRouteAccess()) return;
      resetAdminRoutes();
      setStitchAccountSubView('adminCourses');
    });

    $('#stitchAdminCoursesBackBtn')?.addEventListener('click', () => {
      setStitchAccountSubView('adminManage');
    });

    $('#stitchOpenAdminRegionsBtn')?.addEventListener('click', () => {
      if (hasAdminRegionAccess()) setStitchAccountSubView('adminRegions');
    });
    $('#desktopOpenAdminRegionsBtn')?.addEventListener('click', openDesktopAdminRegions);
    $('#stitchAdminRegionsBackBtn')?.addEventListener('click', () => {
      if (document.body.classList.contains('desktop-admin-regions-open')) closeDesktopAdminRegions();
      else setStitchAccountSubView('adminManage');
    });
    $('#stitchAdminRegionCancelBtn')?.addEventListener('click', () => resetAdminRegionForm());
    $('#stitchAdminRegionForm')?.addEventListener('submit', saveAdminRegion);
    $('#stitchAdminRegionMapPickBtn')?.addEventListener('click', enterAdminRegionPicker);
    $('#adminRegionPickCenterBtn')?.addEventListener('click', pickAdminRegionCenter);
    $('#adminRegionPickBboxBtn')?.addEventListener('click', () => {
      if (!adminRegionPicker) return;
      adminRegionPicker.pickingBbox = !adminRegionPicker.pickingBbox;
      adminRegionPicker.firstCorner = null;
      $('#adminRegionPickBboxBtn').setAttribute('aria-pressed', String(adminRegionPicker.pickingBbox));
      $('#adminRegionPickerStatus').textContent = adminRegionPicker.pickingBbox
        ? '지도의 첫 번째 모서리를 클릭·터치하세요. 지도를 끌어 이동할 수도 있습니다.'
        : '범위 선택을 멈췄습니다.';
    });
    $('#adminRegionClearBboxBtn')?.addEventListener('click', () => {
      if (!adminRegionPicker) return;
      adminRegionPicker.bbox = null;
      adminRegionPicker.firstCorner = null;
      adminRegionPicker.pickingBbox = false;
      $('#adminRegionPickBboxBtn').setAttribute('aria-pressed', 'false');
      for (const name of ['west', 'south', 'east', 'north']) {
        $('#stitchAdminRegionForm').elements.namedItem(name).value = '';
      }
      drawAdminRegionBbox();
      $('#adminRegionPickerStatus').textContent = '범위를 지웠습니다.';
    });
    $('#adminRegionPickerApplyBtn')?.addEventListener('click', () => {
      if (!adminRegionPicker) return;
      if (adminRegionPicker.pickingBbox || adminRegionPicker.firstCorner) {
        $('#adminRegionPickerStatus').textContent = '범위의 두 모서리를 모두 선택하거나 범위 지정을 종료해 주세요.';
        return;
      }
      const form = $('#stitchAdminRegionForm');
      if (!form.elements.namedItem('center_lng').value || !form.elements.namedItem('center_lat').value) {
        $('#adminRegionPickerStatus').textContent = '현재 지도 중심으로 지정 버튼을 눌러 주세요.';
        return;
      }
      exitAdminRegionPicker(true);
    });
    $('#adminRegionPickerCancelBtn')?.addEventListener('click', () => exitAdminRegionPicker(false));
    window.matchMedia('(min-width: 769px)').addEventListener('change', event => {
      if (!event.matches) closeDesktopAdminRegions();
    });
    $('#stitchAdminRegionsList')?.addEventListener('click', event => {
      const button = event.target.closest('button[data-admin-region-action]');
      if (!button) return;
      const row = adminRegionRows.find(item => item.id === button.dataset.regionId);
      if (!row || !hasAdminRegionAccess()) return;
      if (button.dataset.adminRegionAction === 'edit') resetAdminRegionForm(row);
      else if (button.dataset.adminRegionAction === 'toggle') toggleAdminRegion(row.id);
    });

    $('#stitchAdminCoursePreviewCloseBtn')?.addEventListener('click', closeAdminRoutePreview);
    $('#stitchAdminCoursesMoreBtn')?.addEventListener('click', () => loadAdminRoutes());
    $('#stitchAdminCoursesSearch')?.addEventListener('input', () => {
      clearTimeout(adminRouteSearchTimer);
      renderAdminRoutes();
      adminRouteSearchTimer = setTimeout(() => {
        if ($('#stitchAdminCoursesSearch')?.value.trim() && adminRouteHasMore) loadAdminRoutes(true);
      }, 250);
    });
    $('#stitchAdminCoursesList')?.addEventListener('click', e => {
      const button = e.target.closest('button[data-admin-route-action]');
      if (button && !button.disabled) openAdminRoute(button.dataset.routeId, button.dataset.adminRouteAction, button);
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

    const nicknameForm = $('#stitchNicknameForm');
    const nicknameInput = $('#stitchNicknameInput');
    const nicknameFeedback = $('#stitchNicknameFeedback');
    $('#stitchBtnEditNickname')?.addEventListener('click', () => {
      nicknameForm.hidden = !nicknameForm.hidden;
      if (!nicknameForm.hidden) {
        nicknameInput.value = state.profile?.nickname || '';
        nicknameFeedback.textContent = '';
        nicknameInput.focus();
      }
    });
    $('#stitchNicknameCancel')?.addEventListener('click', () => {
      nicknameForm.hidden = true;
      nicknameFeedback.textContent = '';
    });
    nicknameForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const nickname = nicknameInput.value.trim();
      if (nickname.length < 1 || nickname.length > 50) {
        nicknameFeedback.textContent = '닉네임은 1~50자로 입력해 주세요.';
        return;
      }
      const client = supabaseClient;
      const userId = state.session?.user?.id;
      if (!client || !userId) {
        nicknameFeedback.textContent = '로그인 상태를 확인해 주세요.';
        return;
      }
      const submitButton = nicknameForm.querySelector('[type="submit"]');
      submitButton.disabled = true;
      nicknameFeedback.textContent = '';
      let profileSaved = false;
      try {
        const { data, error } = await client.from('profiles')
          .update({ nickname }).eq('id', userId).select('nickname').single();
        if (error) throw error;
        profileSaved = true;
        if (client !== supabaseClient || state.session?.user?.id !== userId) {
          throw new Error('로그인 상태가 변경되었습니다.');
        }
        if (state.profile) state.profile.nickname = data.nickname;
        else await loadUserProfile();
        updateAuthUi();
        const { error: metadataError } = await client.auth.updateUser({ data: { nickname: data.nickname } });
        if (metadataError) throw metadataError;
        nicknameForm.hidden = true;
        toast('닉네임이 성공적으로 변경되었습니다.');
      } catch (error) {
        nicknameFeedback.textContent = profileSaved
          ? `닉네임은 저장됐지만 계정 정보 동기화에 실패했습니다: ${error?.message || '다시 시도해 주세요.'}`
          : error?.message || '닉네임 변경에 실패했습니다.';
      } finally {
        submitButton.disabled = false;
      }
    });

    const passwordForm = $('#stitchPasswordForm');
    const passwordFeedback = $('#stitchPasswordFeedback');
    $('#stitchBtnChangePassword')?.addEventListener('click', () => {
      passwordForm.hidden = !passwordForm.hidden;
      passwordForm.reset();
      passwordFeedback.textContent = '';
      if (!passwordForm.hidden) $('#stitchCurrentPassword').focus();
    });
    $('#stitchPasswordCancel')?.addEventListener('click', () => {
      passwordForm.reset();
      passwordForm.hidden = true;
      passwordFeedback.textContent = '';
    });
    passwordForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const currentPassword = $('#stitchCurrentPassword').value;
      const newPassword = $('#stitchNewPassword').value;
      const confirmPassword = $('#stitchConfirmPassword').value;
      if (newPassword.length < 6) {
        passwordFeedback.textContent = '새 비밀번호는 6자 이상이어야 합니다.';
        return;
      }
      if (newPassword !== confirmPassword) {
        passwordFeedback.textContent = '새 비밀번호 확인이 일치하지 않습니다.';
        return;
      }
      const client = supabaseClient;
      const userId = state.session?.user?.id;
      const email = state.session?.user?.email;
      if (!client || !userId || !email || !currentPassword) {
        passwordFeedback.textContent = '로그인 상태와 현재 비밀번호를 확인해 주세요.';
        return;
      }
      const submitButton = passwordForm.querySelector('[type="submit"]');
      submitButton.disabled = true;
      passwordFeedback.textContent = '';
      try {
        accountPasswordReauthUserId = userId;
        const { data, error: authError } = await client.auth.signInWithPassword({ email, password: currentPassword });
        if (authError) throw authError;
        if (client !== supabaseClient || state.session?.user?.id !== userId || data?.user?.id !== userId) {
          throw new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
        }
        const { error: updateError } = await client.auth.updateUser({ password: newPassword });
        if (updateError) throw updateError;
        passwordForm.reset();
        passwordForm.hidden = true;
        toast('비밀번호가 변경되었습니다.');
      } catch (error) {
        passwordFeedback.textContent = error?.message || '비밀번호 변경에 실패했습니다.';
      } finally {
        accountPasswordReauthUserId = null;
        submitButton.disabled = false;
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
          clearOfflineAccessGrant();
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
      if (!confirm('POWDERLINE 세션을 안전하게 종료하고 로그아웃하시겠습니까?')) return;
      try {
        clearOfflineAccessGrant();
        if (supabaseClient) await supabaseClient.auth.signOut();
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

  function updateMobileHomeMapModeUi() {
    const rideOnButton = $('#homeRideOnBtn');
    const hint = $('#homeMapModeHint');
    const offlinePanel = $('#homeOfflineRegionsPanel');
    const selectedRegionId = $('#homeRegionSelect')?.value || '';
    const selectedRegion = regions[selectedRegionId];
    const selectedPayload = selectedRegion ? createOfflineRegionPayload(selectedRegionId, selectedRegion).payload : null;
    const selectedOfflineStatus = offlineRegionStatuses.get(selectedRegionId);
    const onlineReady = mobileHomeMapMode === 'online';
    const offlineReady = mobileHomeMapMode === 'offline' && Boolean(selectedPayload) &&
      offlineUsable(selectedOfflineStatus) && !offlineRegionOpenInProgress;
    const rideOnDisabled = !(onlineReady || offlineReady);
    document.querySelectorAll('[data-home-map-mode]').forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.homeMapMode === mobileHomeMapMode));
    });
    if (rideOnButton) {
      rideOnButton.disabled = rideOnDisabled;
      rideOnButton.toggleAttribute('disabled', rideOnDisabled);
      rideOnButton.setAttribute('aria-disabled', String(rideOnDisabled));
    }
    if (offlinePanel) offlinePanel.hidden = mobileHomeMapMode !== 'offline';
    if (hint) {
      hint.classList.toggle('offline', mobileHomeMapMode === 'offline');
      hint.textContent = mobileHomeMapMode === 'online'
        ? '온라인 3D 지도로 진입할 수 있습니다.'
        : mobileHomeMapMode === 'offline'
          ? offlineRegionOpenInProgress
            ? '오프라인 3D 지도를 여는 중입니다…'
            : selectedOfflineStatus?.complete === true
              ? '다운로드 완료 지역입니다. RIDE ON으로 진입할 수 있습니다.'
              : offlineUsable(selectedOfflineStatus)
                ? '오프라인으로 열 수 있지만 일부 지도가 비어 보일 수 있습니다. 인터넷 연결 후 보완 다운로드하세요.'
              : selectedOfflineStatus?.loading
                ? '선택 지역의 저장 상태를 확인하는 중입니다…'
                : navigator.onLine === false
                  ? '다운로드되지 않은 지역은 오프라인에서 사용할 수 없습니다. 다운로드된 지역을 선택해 주세요.'
                  : '선택 지역을 먼저 다운로드해 주세요.'
          : '지도 모드를 선택하세요.';
    }
    if (mobileHomeMapMode === 'offline') renderOfflineRegionList();
  }

  function setMobileHomeMapMode(mode) {
    mobileHomeMapMode = mode === 'online' || mode === 'offline' ? mode : '';
    updateMobileHomeMapModeUi();
    if (mobileHomeMapMode === 'offline') void refreshOfflineRegionStatuses();
    scheduleNativeMapSync();
  }

  async function refreshMobileHomeCatalog() {
    if (!supabaseClient) {
      renderMobileHome();
      return;
    }
    if (mobileHomeCatalogRefreshPromise) return mobileHomeCatalogRefreshPromise;
    const client = supabaseClient;
    mobileHomeCatalogRefreshPromise = withTimeout(
      loadRegionCatalog(client), INITIAL_AUTH_TIMEOUT_MS, 'Region sync timed out.'
    ).catch(error => {
      console.warn('Mobile home region refresh failed:', error);
      return { error };
    }).finally(() => {
      mobileHomeCatalogRefreshPromise = null;
    });
    const result = await mobileHomeCatalogRefreshPromise;
    if (client === supabaseClient) {
      renderMobileHome();
    }
    return result;
  }

  // complete = everything needed offline is stored for this device; usable = the region's own tiles + style are stored
  // (opens offline, but parts may be empty until a supplementary download).
  function offlineUsable(status) { return status?.complete === true || status?.usable === true; }
  function offlineMissingText(missing) {
    const names = { pixel_ratio: '고해상도 위성 영상', context: '주변 저배율 지형', style: '지도 스타일', zoom: '확대 범위', profile_missing: '이전 버전 다운로드' };
    const parts = Array.isArray(missing) ? [...new Set(missing.map(code => names[code]).filter(Boolean))] : [];
    return parts.length ? ` (${parts.join('·')})` : '';
  }
  function getOfflineMapTestPlugin() {
    const capacitor = window.Capacitor;
    if (capacitor?.getPlatform?.() !== 'android') return null;
    offlineMapTestPlugin ||= capacitor.registerPlugin
      ? capacitor.registerPlugin('OfflineMapTest')
      : capacitor.Plugins?.OfflineMapTest || null;
    return offlineMapTestPlugin;
  }

  // The device saved tiles/ski data for another BBox than the registry now has (admin changed the region).
  function offlineRegionBboxChanged(status, details) {
    const saved = status?.skiData?.savedBbox;
    const current = parseRegionBbox(details?.bbox);
    if (!Array.isArray(saved) || saved.length !== 4 || !current) return false;
    return saved.some((value, index) => !(Math.abs(Number(value) - current[index]) <= 1e-6));
  }

  // Ski data (lifts/runs) is small: when the server published a newer version for a downloaded region, update
  // it silently while online. A failed refresh keeps the saved file (native side) and is retried on the next check.
  const offlineSkiRefreshAttempts = new Set();
  async function autoRefreshOfflineSkiData(entries) {
    const plugin = getOfflineMapTestPlugin();
    if (!plugin?.refreshSkiData || navigator.onLine === false) return;
    let changed = false;
    for (const [id, details] of entries) {
      const status = offlineRegionStatuses.get(id);
      if (!status?.complete || details.skiDataStatus !== 'ready' || !details.skiDataVersion) continue;
      if (status.skiData?.version === details.skiDataVersion || offlineRegionBboxChanged(status, details)) continue;
      const attemptKey = `${id}@${details.skiDataVersion}`;
      if (offlineSkiRefreshAttempts.has(attemptKey)) continue;
      const { payload } = createOfflineRegionPayload(id, details);
      if (!payload) continue;
      offlineSkiRefreshAttempts.add(attemptKey);
      try {
        const result = await plugin.refreshSkiData(payload);
        if (result?.skiData?.status !== 'saved') offlineSkiRefreshAttempts.delete(attemptKey);
        const next = await plugin.getOfflineStatus({ regionId: id });
        if (next) { offlineRegionStatuses.set(id, next); changed = true; }
      } catch (error) {
        offlineSkiRefreshAttempts.delete(attemptKey);
        console.warn('Offline ski data refresh failed:', id, error);
      }
    }
    if (changed) updateMobileHomeMapModeUi();
  }

  function getOfflineCatalogRegions() {
    return Object.entries(regions)
      .filter(([id, details]) => catalogRegionIds.has(id) && !details.custom && details.isActive !== false)
      .sort((a, b) => (a[1].sortOrder ?? 999) - (b[1].sortOrder ?? 999));
  }

  function createOfflineRegionPayload(id, details) {
    const center = Array.isArray(details.center) ? details.center.map(Number) : null;
    const bounds = parseRegionBbox(details.bbox);
    const centerValid = center?.length === 2 && center.every(Number.isFinite);
    const boundsValid = bounds?.length === 4 && bounds.every(Number.isFinite) &&
      bounds[0] < bounds[2] && bounds[1] < bounds[3];
    return {
      payload: centerValid && boundsValid
        ? {
          regionId: id, regionName: details.label, center, bounds,
          // Lets the native plugin fetch ski-data/{id}.geojson only when the server marked it ready.
          skiDataStatus: details.skiDataStatus || '', skiDataVersion: details.skiDataVersion || '', supabaseUrl: SUPABASE_URL
        }
        : null,
      unavailableReason: !centerValid ? '중심 좌표가 없습니다.' : !boundsValid ? '경계 좌표가 없습니다.' : ''
    };
  }

  function renderOfflineRegionList() {
    const list = $('#homeOfflineRegionList');
    if (!list) return;
    let entries = getOfflineCatalogRegions();
    const noNetwork = navigator.onLine === false;
    if (noNetwork) entries = entries.filter(([id]) => { const st = offlineRegionStatuses.get(id); return offlineUsable(st) || st?.loading; });
    if (!entries.length) {
      const catalog = state.offlineCatalog;
      const stillLoading = catalog.phase === 'loading' || catalog.phase === 'idle' && mobileHomeCatalogRefreshPromise;
      const message = stillLoading ? '다운로드된 지역을 확인하는 중입니다…'
        : catalog.phase === 'timeout' ? '저장된 지역 목록 조회 시간이 초과되었습니다. 지도 모드를 다시 선택해 주세요.'
        : catalog.phase === 'error' ? `저장된 지역 목록을 불러오지 못했습니다.${catalog.message ? ' (' + catalog.message + ')' : ''}`
        : noNetwork ? '다운로드된 오프라인 지역이 없습니다. 인터넷에 연결한 뒤 지역을 다운로드해 주세요.'
        : '표시할 지역이 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
      list.innerHTML = `<p class="home-offline-region-empty">${escapeHtml(message)}</p>`;
      return;
    }
    const androidAvailable = Boolean(getOfflineMapTestPlugin());
    list.innerHTML = entries.map(([id, details]) => {
      const { payload, unavailableReason } = createOfflineRegionPayload(id, details);
      const status = offlineRegionStatuses.get(id);
      const downloading = offlineRegionDownloads.has(id);
      const queuePosition = offlineDownloadQueue.indexOf(id);
      const outcome = offlineRegionOutcome.get(id);
      let stateClass = 'available';
      const skiStatus = details.skiDataStatus;
      const skiNote = skiStatus === 'pending' || skiStatus === 'processing' ? ' · 리프트·슬로프 데이터 준비 중' : skiStatus === 'failed' ? ' · 리프트·슬로프 데이터 준비 실패' : '';
      let stateLabel = androidAvailable ? '다운로드 가능' + skiNote : 'Android 앱에서 다운로드 가능';
      let buttonLabel = '다운로드';
      let disabled = !androidAvailable;
      if (!payload) {
        stateClass = 'unavailable';
        stateLabel = `다운로드 불가 · ${unavailableReason}`;
        disabled = true;
      } else if (downloading) {
        stateClass = 'loading';
        stateLabel = offlineActiveJob?.cancelRequested ? '취소하는 중…' : offlineProgressText(offlineRegionProgress.get(id), offlineStalled());
        buttonLabel = '취소';
        disabled = Boolean(offlineActiveJob?.cancelRequested);
      } else if (queuePosition >= 0) {
        stateClass = 'loading';
        stateLabel = `대기 중 · ${queuePosition + 1}번째`;
        buttonLabel = '취소';
        disabled = false;
      } else if (outcome && !status?.complete) {
        stateClass = 'incomplete';
        stateLabel = outcome.state === 'cancelled' ? '취소됨 · 다시 다운로드 가능' : `다운로드 실패 · 다시 다운로드 가능${outcome.message ? ' (' + outcome.message + ')' : ''}`;
        buttonLabel = '다시 다운로드';
        disabled = !androidAvailable || navigator.onLine === false;
      } else if (status?.loading) {
        stateClass = 'loading';
        stateLabel = '저장 상태 확인 중…';
        disabled = true;
      } else if (status?.complete && offlineRegionBboxChanged(status, details)) {
        stateClass = 'incomplete';
        stateLabel = '지역 범위가 변경되었습니다 · 다시 다운로드 필요';
        buttonLabel = '다시 다운로드';
      } else if (status?.complete) {
        stateClass = 'complete';
        stateLabel = '다운로드 완료' + skiNote;
        buttonLabel = '완료';
        disabled = true;
      } else if (status?.needsUpdate) {
        stateClass = 'incomplete';
        stateLabel = (offlineRegionBboxChanged(status, details) ? '지역 범위가 변경되었습니다 · ' : '') + '보완 다운로드 필요' + offlineMissingText(status.missing);
        buttonLabel = '보완 다운로드';
        disabled = !androidAvailable || navigator.onLine === false;
      } else if (status?.downloaded) {
        stateClass = 'incomplete';
        stateLabel = '다운로드 미완료';
        buttonLabel = '다시 다운로드';
      } else if (status?.error) {
        stateClass = 'incomplete';
        stateLabel = '상태 확인 실패 · 다운로드 가능';
      }
      return `<article class="home-offline-region-item" data-offline-region-id="${escapeHtml(id)}">` +
        `<div><strong>${escapeHtml(details.label)}</strong><small>${escapeHtml(id)}</small>` +
        `<span class="home-offline-region-state ${stateClass}">${escapeHtml(stateLabel)}</span>` +
        (downloading ? `<i class="home-offline-region-bar"><b style="width:${offlineProgressPercent(offlineRegionProgress.get(id))}%"></b></i>` : '') + '</div>' +
        `<button type="button" data-offline-region-download="${escapeHtml(id)}"${disabled ? ' disabled' : ''}>${escapeHtml(buttonLabel)}</button>` +
        '</article>';
    }).join('');
  }

  // Regions saved on this device (Native storage) become catalog entries even when Supabase cannot be reached.
  // Result is always one of: ready | empty | error | timeout (never left in "loading").
  async function ensureLocalOfflineCatalog() {
    const catalog = state.offlineCatalog;
    const plugin = getOfflineMapTestPlugin();
    if (!plugin?.listOfflineRegions) { catalog.phase = 'ready'; return; }
    catalog.phase = 'loading';
    catalog.message = '';
    renderOfflineRegionList();
    try {
      const result = await withTimeout(plugin.listOfflineRegions(), 5000, 'LOCAL_LIST_TIMEOUT');
      const saved = Array.isArray(result?.regions) ? result.regions : [];
      let added = false;
      for (const item of saved) {
        const id = String(item?.regionId || '').trim();
        const center = Array.isArray(item?.center) ? item.center.map(Number) : null;
        const bbox = parseRegionBbox(item?.bbox);
        if (!id || !center || center.length !== 2 || !center.every(Number.isFinite) || !bbox) continue;
        if (!regions[id]) {
          regions[id] = { label: item.regionName || id, center, zoom: 12, bearing: 0, pitch: 45, sortOrder: 900, isActive: true, bbox, skiDataStatus: '', skiDataVersion: '' };
          added = true;
        } else if (!regions[id].bbox) {
          regions[id].bbox = bbox;
        }
        catalogRegionIds.add(id);
      }
      catalog.phase = saved.length ? 'ready' : 'empty';
      if (added) syncRegionSelectors();
    } catch (error) {
      const timedOut = String(error?.message || '').includes('LOCAL_LIST_TIMEOUT');
      catalog.phase = timedOut ? 'timeout' : 'error';
      catalog.message = timedOut ? '' : (error?.message || '');
    }
  }

  async function refreshOfflineRegionStatuses() {
    const plugin = getOfflineMapTestPlugin();
    await ensureLocalOfflineCatalog();
    const entries = getOfflineCatalogRegions();
    if (!plugin?.getOfflineStatus || !entries.length) {
      updateMobileHomeMapModeUi();
      return;
    }
    const requestId = ++offlineRegionStatusRequest;
    for (const [id] of entries) offlineRegionStatuses.set(id, { loading: true });
    updateMobileHomeMapModeUi();
    try {
      await Promise.all(entries.map(async ([id]) => {
        try {
          const status = await withTimeout(plugin.getOfflineStatus({ regionId: id }), 8000, '상태 조회 시간이 초과되었습니다.');
          if (requestId === offlineRegionStatusRequest) offlineRegionStatuses.set(id, status || {});
        } catch (error) {
          if (requestId === offlineRegionStatusRequest) offlineRegionStatuses.set(id, { error: error?.message || '상태 조회 실패' });
        }
      }));
    } finally {
      if (requestId === offlineRegionStatusRequest) {
        updateMobileHomeMapModeUi();
        void autoRefreshOfflineSkiData(entries);
        selectDownloadedRegionWhenOffline(entries);
      }
    }
  }
  // No network: the home region select should start on a region that can actually be opened.
  function selectDownloadedRegionWhenOffline(entries) {
    if (navigator.onLine !== false || mobileHomeMapMode !== 'offline') return;
    const select = $('#homeRegionSelect');
    if (!select || offlineUsable(offlineRegionStatuses.get(select.value))) return;
    const ready = entries.find(([id]) => offlineUsable(offlineRegionStatuses.get(id)));
    if (ready && [...select.options].some(option => option.value === ready[0])) {
      select.value = ready[0];
      select.dispatchEvent(new Event('change'));
    }
  }

  // Native reports real TileStore resource counts (event "offlineDownloadProgress", ~2/s) tagged with regionId + jobId.
  const OFFLINE_PHASE_LABEL = { style: '스타일', tiles: '지도 타일', context: '주변 타일' };
  function offlineProgressPercent(p) {
    return p && Number.isFinite(p.percent) && p.percent >= 0 ? Math.min(100, Math.round(p.percent)) : 0;
  }
  function offlineStalled(now = Date.now()) {
    return Boolean(offlineActiveJob && !offlineActiveJob.cancelRequested && now - offlineActiveJob.lastChangeAt >= OFFLINE_STALL_MS);
  }
  function offlineProgressText(p, stalled = false) {
    const parts = [];
    if (stalled) parts.push('진행 정체 · 네트워크 확인 필요');
    if (!p) { parts.push('다운로드 준비 중…'); return parts.join(' · '); }
    parts.push(`${OFFLINE_PHASE_LABEL[p.phase] || '다운로드'} ${p.percent >= 0 ? offlineProgressPercent(p) + '%' : '계산 중'}`);
    if (p.required > 0) parts.push(`${Number(p.done).toLocaleString('ko-KR')}/${Number(p.required).toLocaleString('ko-KR')}`);
    if (p.mb > 0) parts.push(`${p.mb.toFixed(1)}MB`);
    if (!stalled && p.etaSec > 0) parts.push(p.etaSec >= 90 ? `약 ${Math.ceil(p.etaSec / 60)}분 남음` : `약 ${p.etaSec}초 남음`);
    if (p.errored > 0) parts.push(`실패 ${p.errored}개`);
    return parts.join(' · ');
  }
  function paintOfflineProgress(id) {
    const item = document.querySelector(`[data-offline-region-id="${CSS.escape(id)}"]`);
    const label = item?.querySelector('.home-offline-region-state');
    if (!label || !offlineActiveJob || offlineActiveJob.id !== id || offlineActiveJob.cancelRequested) return;
    const p = offlineRegionProgress.get(id);
    label.textContent = offlineProgressText(p, offlineStalled());
    const bar = item.querySelector('.home-offline-region-bar b');
    if (bar) bar.style.width = offlineProgressPercent(p) + '%';
  }
  let offlineProgressListenerBound = false;
  function bindOfflineDownloadProgress(plugin) {
    if (offlineProgressListenerBound || !plugin?.addListener) return;
    offlineProgressListenerBound = true;
    plugin.addListener('offlineDownloadProgress', event => {
      const job = offlineActiveJob;
      // Only events of the job that is running now; late events of a cancelled/finished job are dropped.
      if (!job || job.cancelRequested || event?.regionId !== job.id || (event.jobId && event.jobId !== job.jobId)) return;
      const sig = `${event.phase}:${event.done}:${Math.round((event.mb || 0) * 100)}`;
      if (sig !== job.sig) { job.sig = sig; job.lastChangeAt = Date.now(); }
      offlineRegionProgress.set(job.id, event);
      paintOfflineProgress(job.id);
    });
  }

  // Queue: Native downloads exactly one region at a time; further regions wait here in FIFO order.
  function enqueueOfflineRegionDownload(id) {
    if (offlineRegionDownloads.has(id) || offlineDownloadQueue.includes(id)) return;
    const plugin = getOfflineMapTestPlugin();
    const { payload, unavailableReason } = createOfflineRegionPayload(id, regions[id] || {});
    if (!payload || !plugin?.downloadRegion) {
      toast(unavailableReason || 'Android 앱에서만 다운로드할 수 있습니다.');
      return;
    }
    offlineRegionOutcome.delete(id);
    offlineDownloadQueue.push(id);
    renderOfflineRegionList();
    void pumpOfflineDownloads();
  }
  async function pumpOfflineDownloads() {
    if (offlineActiveJob || !offlineDownloadQueue.length) return;
    const id = offlineDownloadQueue.shift();
    await runOfflineRegionDownload(id);
  }
  async function runOfflineRegionDownload(id) {
    const details = regions[id];
    const plugin = getOfflineMapTestPlugin();
    const { payload } = createOfflineRegionPayload(id, details || {});
    const job = { id, jobId: `${id}-${Date.now()}`, lastChangeAt: Date.now(), sig: '', cancelRequested: false };
    if (!payload || !plugin?.downloadRegion) {
      offlineRegionOutcome.set(id, { state: 'failed', message: '다운로드할 수 없는 지역' });
      renderOfflineRegionList();
      void pumpOfflineDownloads();
      return;
    }
    bindOfflineDownloadProgress(plugin);
    offlineActiveJob = job;
    offlineRegionProgress.delete(id);
    offlineRegionDownloads.add(id);
    clearInterval(offlineStallTimer);
    offlineStallTimer = setInterval(() => paintOfflineProgress(id), 5000);
    renderOfflineRegionList();
    try {
      await plugin.downloadRegion({ ...payload, jobId: job.jobId });
      offlineRegionOutcome.delete(id);
      const verifiedStatus = await plugin.getOfflineStatus({ regionId: id });
      offlineRegionStatuses.set(id, verifiedStatus || {});
      if (verifiedStatus?.complete === true) toast(`${details.label} 오프라인 지도 다운로드를 완료했습니다.`);
      else if (offlineUsable(verifiedStatus)) toast(`${details.label} 지도는 저장됐지만 보완이 필요합니다${offlineMissingText(verifiedStatus.missing)}.`);
      else toast(`${details.label} 다운로드가 아직 완료되지 않았습니다.`);
    } catch (error) {
      if (job.cancelRequested || error?.code === 'CANCELLED') {
        offlineRegionOutcome.set(id, { state: 'cancelled', message: '' });
      } else {
        offlineRegionOutcome.set(id, { state: 'failed', message: String(error?.message || '다운로드 실패').slice(0, 80) });
        toast(error?.message || '오프라인 지도 다운로드에 실패했습니다.');
      }
      // Stored tiles are kept by Native; refresh what is really on the device for the list.
      try { offlineRegionStatuses.set(id, (await plugin.getOfflineStatus({ regionId: id })) || {}); } catch { }
    } finally {
      if (offlineActiveJob === job) offlineActiveJob = null;
      offlineRegionDownloads.delete(id);
      offlineRegionProgress.delete(id);
      clearInterval(offlineStallTimer);
      offlineStallTimer = null;
      updateMobileHomeMapModeUi();
      renderOfflineRegionList();
      void pumpOfflineDownloads(); // next region starts only after this job has fully ended
    }
  }
  // Waiting regions are simply dropped from the queue; the running one is stopped for real in Native.
  async function cancelOfflineRegionDownload(id) {
    const queued = offlineDownloadQueue.indexOf(id);
    if (queued >= 0) {
      offlineDownloadQueue.splice(queued, 1);
      offlineRegionOutcome.set(id, { state: 'cancelled', message: '' });
      renderOfflineRegionList();
      return;
    }
    const job = offlineActiveJob;
    if (!job || job.id !== id || job.cancelRequested) return;
    const plugin = getOfflineMapTestPlugin();
    if (!plugin?.cancelRegionDownload) { toast('이 앱 버전은 다운로드 취소를 지원하지 않습니다. 앱을 업데이트해 주세요.'); return; }
    job.cancelRequested = true;
    renderOfflineRegionList();
    try {
      const result = await plugin.cancelRegionDownload({ regionId: id, jobId: job.jobId });
      // cancelled:false = the download had already ended; its own result handling shows the real state.
      if (!result?.cancelled) job.cancelRequested = false;
    } catch (error) {
      job.cancelRequested = false;
      toast(`취소하지 못했습니다: ${error?.message || '알 수 없는 오류'}`);
      renderOfflineRegionList();
    }
  }

  // ==========================================================================
  // Embedded Native offline map (Android only). The Native MapView sits UNDER the transparent WebView, so the header,
  // bottom menu and graph stay HTML. This page tells native (a) where the map area is and (b) which screen cells are
  // plain map (no UI on top) so native can forward exactly those touches to the MapView. Online mode is untouched.
  // ==========================================================================
  const NATIVE_MAP_VIEWS = ['map', 'ride', 'routes']; // view only; the course editor stays online-only
  function nativeMapPlugin() {
    const plugin = getOfflineMapTestPlugin();
    return plugin?.showEmbeddedMap && plugin?.setEmbeddedMapLayout && plugin?.hideEmbeddedMap ? plugin : null;
  }
  function isNativeMapBackdrop(el) {
    return !el || el === document.documentElement || el === document.body || Boolean(el.closest?.('#map')) || Boolean(el.matches?.('.app-shell, .map-panel'));
  }
  function computeNativeMapLayout(visible) {
    const rect = $('#map')?.getBoundingClientRect();
    const layout = { visible, rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined };
    if (!visible) return layout;
    const cell = 16, cols = Math.ceil(window.innerWidth / cell), rows = Math.ceil(window.innerHeight / cell);
    const bits = new Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) bits[r * cols + c] = isNativeMapBackdrop(document.elementFromPoint((c + 0.5) * cell, (r + 0.5) * cell)) ? '1' : '0';
    }
    layout.grid = { cols, rows, cell, bits: bits.join('') };
    return layout;
  }
  function setNativeMapVisualState(visible) {
    document.documentElement.classList.toggle('native-map-active', visible);
  }
  async function deactivateNativeMap(endSession = true) {
    const nm = state.nativeMap;
    const wasActive = nm.active;
    nm.active = false;
    nm.shown = false;
    nm.regionId = '';
    if (endSession) { nm.session = false; nm.unavailable = ''; }
    updateNativeNotice();
    setNativeMapVisualState(false);
    if (wasActive) { try { await nativeMapPlugin()?.hideEmbeddedMap(); } catch (error) { console.warn('hideEmbeddedMap failed:', error); } }
  }
  async function syncNativeMapLayout() {
    const nm = state.nativeMap;
    if (!nm.active) return;
    const plugin = nativeMapPlugin();
    if (!plugin) return;
    if (mobileHomeMapMode !== 'offline') { await deactivateNativeMap(); return; } // back to online: release the native map
    const view = document.body.dataset.mobileView || '';
    const visible = NATIVE_MAP_VIEWS.includes(view);
    nm.shown = visible;
    setNativeMapVisualState(visible);
    try {
      const result = await plugin.setEmbeddedMapLayout(computeNativeMapLayout(visible));
      if (result && result.shown === false) { nm.active = false; nm.shown = false; setNativeMapVisualState(false); }
    } catch (error) { console.warn('setEmbeddedMapLayout failed:', error); }
  }
  // "My location" button while the Native map is on screen: native shows the position, recenters and (re)arms follow.
  // Returns false (online logic runs) whenever the Native map is not the visible map.
  window.powderlineNativeLocate = () => {
    const nm = state.nativeMap;
    const plugin = nm.active && nm.shown ? nativeMapPlugin() : null;
    if (!plugin?.centerEmbeddedGps) return false;
    plugin.centerEmbeddedGps().catch(error => console.warn('centerEmbeddedGps failed:', error));
    return true;
  };
  function scheduleNativeMapSync() {
    const nm = state.nativeMap;
    updateNativeNotice();
    if (!nm.active) return;
    clearTimeout(nm.timer);
    nm.timer = setTimeout(() => { void syncNativeMapLayout(); }, 120);
  }
  function initNativeMapObservers() {
    if (state.nativeMap.observer) return;
    $('#region')?.addEventListener('change', () => { void onNativeRegionChange(); });
    if (!map.__nativeFitWrapped) { // saved-course selection etc. call map.fitBounds: mirror it on the Native camera
      const originalFit = map.fitBounds.bind(map);
      map.fitBounds = (bounds, options, eventData) => { nativeFitBounds(bounds, options); return originalFit(bounds, options, eventData); };
      map.__nativeFitWrapped = true;
    }
    window.addEventListener('resize', scheduleNativeMapSync);
    window.addEventListener('orientationchange', scheduleNativeMapSync);
    state.nativeMap.observer = new MutationObserver(records => {
      if (records.some(record => !record.target.closest?.('#map'))) scheduleNativeMapSync();
    });
    state.nativeMap.observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'data-mobile-view'] });
  }

  // ---- web -> native bridges (no-ops unless the Native map is active) ----
  // Course route(s) + the GPS recording line in one collection for the Native route source (the line is drawn last = on top).
  function nativeRouteCollection(nm) {
    if (!nm.gpsLine) return nm.route;
    return { type: 'FeatureCollection', features: [...(nm.route?.features || []), nm.gpsLine] };
  }
  function pushNativeGpsRoute(coordinates) {
    const nm = state.nativeMap;
    const had = Boolean(nm.gpsLine);
    nm.gpsLine = coordinates.length > 1
      ? { type: 'Feature', properties: { color: '#38bdf8', glowColor: '#38bdf8', selected: true, gpsRecording: true }, geometry: { type: 'LineString', coordinates } }
      : null;
    if (nm.gpsLine || had) pushNativeRoute(null); // kept while the Native map is hidden; sent again by showNativeRegion
  }
  function pushNativeRoute(collection, immediate = false) {
    const nm = state.nativeMap;
    if (collection) nm.route = collection;
    if (!nm.active) return;
    const send = () => {
      const plugin = nativeMapPlugin();
      const data = nativeRouteCollection(nm) || (nm.gpsLine === null && nm.route === null ? { type: 'FeatureCollection', features: [] } : null);
      if (plugin?.setEmbeddedRoute && data) plugin.setEmbeddedRoute({ geojson: JSON.stringify(data) }).catch(() => { });
    };
    if (immediate) { send(); return; }
    clearTimeout(nm.routeTimer);
    nm.routeTimer = setTimeout(send, 60);
  }
  function pushNativeCursor(sample) {
    if (!state.nativeMap.active) return;
    const plugin = nativeMapPlugin();
    if (!plugin?.setEmbeddedProfileMarker) return;
    plugin.setEmbeddedProfileMarker(sample ? { lng: sample.lng, lat: sample.lat } : { clear: true }).catch(() => { });
  }
  // HUD buttons (zoom / north / 3D) drive the Native camera while the Native map is on screen.
  function nativeCameraCommand(cmd) {
    const nm = state.nativeMap;
    const plugin = nm.active && nm.shown ? nativeMapPlugin() : null;
    if (!plugin?.embeddedCamera) return false;
    plugin.embeddedCamera({ cmd }).catch(error => console.warn('embeddedCamera failed:', error));
    return true;
  }
  function applyNativeCameraUi(camera) {
    const rotation = 'rotate(' + (-camera.bearing) + 'deg)';
    for (const id of ['#mobileCompassNeedle', '#rideCompassNeedle']) { const el = $(id); if (el) el.style.transform = rotation; }
    const pitching = camera.pitch > 20;
    for (const id of ['#mobileTiltLabel', '#rideTiltLabel']) { const el = $(id); if (el) el.textContent = pitching ? '3D' : '2D'; }
    $('#mobileTiltBtn')?.classList.toggle('active', pitching);
  }
  function nativeFitBounds(bounds, options) {
    const nm = state.nativeMap;
    const plugin = nm.active ? nativeMapPlugin() : null;
    if (!plugin?.embeddedCamera) return;
    try {
      const [[w, so], [e, n]] = mapboxgl.LngLatBounds.convert(bounds).toArray();
      plugin.embeddedCamera({ cmd: 'fit', bounds: [w, so, e, n], padding: typeof options?.padding === 'number' ? options.padding : 60, maxZoom: options?.maxZoom ?? 13 }).catch(() => { });
    } catch (error) { console.warn('native fit failed:', error); }
  }
  function updateNativeNotice() {
    const nm = state.nativeMap;
    const show = Boolean(nm.session && mobileHomeMapMode === 'offline' && nm.unavailable && NATIVE_MAP_VIEWS.includes(document.body.dataset.mobileView || ''));
    let el = $('#nativeMapNotice');
    if (!show) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'nativeMapNotice';
      el.style.cssText = 'position:fixed;left:24px;right:24px;top:42%;z-index:20;padding:14px 16px;border-radius:12px;background:rgba(11,21,35,.92);color:#e2e8f0;font-size:13px;line-height:1.5;text-align:center;pointer-events:none;border:1px solid rgba(56,189,248,.4)';
      document.body.appendChild(el);
    }
    el.textContent = `${regions[nm.unavailable]?.label || nm.unavailable} 지역은 다운로드된 오프라인 지도가 없습니다. 홈에서 오프라인 지도를 다운로드하거나 온라인 지도를 이용해 주세요.`;
    el.hidden = false;
  }
  async function showNativeRegion(regionId, payload) {
    const plugin = nativeMapPlugin();
    await plugin.showEmbeddedMap({ ...payload, ...computeNativeMapLayout(false) });
    const nm = state.nativeMap;
    nm.active = true;
    nm.session = true;
    nm.regionId = regionId;
    nm.unavailable = '';
    initNativeMapObservers();
    if (!nm.eventsBound) {
      nm.eventsBound = true;
      plugin.addListener('embeddedCamera', camera => applyNativeCameraUi(camera));
      plugin.addListener('embeddedIdle', () => {
        if (!nm.shown) return;
        updateProfileViewport();
        if (profile.pending) scheduleProfile(80); // DEM tiles became available
      });
    }
    pushNativeRoute(null, true);
    pushNativeCursor(profile.selected);
  }
  // Region changed in the map screen: switch the Native map to that downloaded region, or say it is not available.
  async function onNativeRegionChange() {
    const nm = state.nativeMap;
    const plugin = nativeMapPlugin();
    if (!plugin || !nm.session || mobileHomeMapMode !== 'offline') return;
    const regionId = $('#region')?.value || '';
    if (regionId === nm.regionId && nm.active) return;
    const { payload } = createOfflineRegionPayload(regionId, regions[regionId] || {});
    let complete = false;
    if (payload) {
      try {
        const status = await plugin.getOfflineStatus({ regionId });
        offlineRegionStatuses.set(regionId, status || {});
        complete = offlineUsable(status);
      } catch (error) { console.warn('offline status failed:', error); }
    }
    if ($('#region')?.value !== regionId) return; // changed again while checking
    if (complete) {
      try { await showNativeRegion(regionId, payload); scheduleNativeMapSync(); } catch (error) { toast(error?.message || '오프라인 지도를 열지 못했습니다.'); }
    } else {
      await deactivateNativeMap(false);
      nm.unavailable = regionId;
      toast('이 지역은 다운로드된 오프라인 지도가 없습니다.');
      updateNativeNotice();
    }
  }

  async function openOfflineHomeRegion() {
    if (offlineRegionOpenInProgress) return;
    const regionId = $('#homeRegionSelect')?.value || '';
    const details = regions[regionId];
    const plugin = getOfflineMapTestPlugin();
    const { payload, unavailableReason } = createOfflineRegionPayload(regionId, details || {});
    if (!payload || !plugin?.getOfflineStatus || !plugin?.showEmbeddedMap) {
      toast(unavailableReason || 'Android 앱에서만 오프라인 지도를 열 수 있습니다.');
      return;
    }
    offlineRegionOpenInProgress = true;
    offlineRegionStatuses.set(regionId, { loading: true });
    updateMobileHomeMapModeUi();
    try {
      const status = await withTimeout(plugin.getOfflineStatus({ regionId }), 8000, '상태 조회 시간이 초과되었습니다.');
      offlineRegionStatuses.set(regionId, status || {});
      if (!offlineUsable(status)) {
        toast('선택 지역의 오프라인 다운로드를 먼저 완료해 주세요.');
        return;
      }
      const embedded = nativeMapPlugin();
      if (embedded) {
        // Same downloaded region/tiles/ski data; the map is shown inside the main screen instead of the test screen.
        await withTimeout(showNativeRegion(regionId, payload), 25000, '오프라인 지도를 여는 시간이 초과되었습니다.');
        mobileHomeRideOn('ride');
      } else {
        toast('이 앱 버전에서는 오프라인 지도를 열 수 없습니다. 앱을 업데이트해 주세요.');
      }
    } catch (error) {
      toast(error?.message || '오프라인 지도를 열지 못했습니다.');
    } finally {
      offlineRegionOpenInProgress = false;
      updateMobileHomeMapModeUi();
    }
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
    updateMobileHomeMapModeUi();
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
    state.points = prepareEditPoints(item.points);
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
    if (window.matchMedia('(max-width: 768px)').matches) {
      if (typeof setMobileAppView === 'function') {
        setMobileAppView(destinationView);
      }
    } else {
      const homeScreen = $('#mobileHomeScreen');
      if (homeScreen) homeScreen.hidden = true;
      delete document.body.dataset.mobileView;
      map.resize();
    }
  }

  function syncMobileHomeSelectionHud(idx) {
    const region = $('#region')?.value;
    for (const id of ['rideRegionSelect', 'mobileRegionSelect']) {
      const select = $(`#${id}`);
      if (select && region && select.value !== region) select.value = region;
    }
    if (typeof renderMobileMapCourses === 'function') renderMobileMapCourses({ reset: true });
    const item = idx !== '' && idx != null ? state.saved[+idx] : null;
    const mapCourse = $('#mobileMapCourseSelect');
    if (mapCourse && item && [...mapCourse.options].some(option => option.value === String(idx))) {
      mapCourse.value = String(idx);
    }
    if (!item) {
      const rideName = $('#rideCourseName');
      if (rideName) rideName.textContent = '코스를 선택하세요';
      const mobileCourseNameEl = $('#mobileCourseNameDisplay');
      if (mobileCourseNameEl) mobileCourseNameEl.textContent = t('brandSubtitle');
    }
  }

  function mobileHomeRideOn(destinationView = 'ride') {
    const regionSel = $('#homeRegionSelect');
    const courseSel = $('#homeCourseSelect');
    const srcRegion = $('#region');
    const homeScreen = $('#mobileHomeScreen');
    if (regionSel && srcRegion && regionSel.value && regionSel.value !== srcRegion.value) {
      srcRegion.value = regionSel.value;
      srcRegion.dispatchEvent(new Event('change'));
    }
    const idx = courseSel?.value;
    if (idx !== undefined && idx !== '') {
      const selectedItem = state.saved[+idx];
      if (selectedItem) {
        syncMobileHomeSelectionHud(idx);
        applySavedRoute(selectedItem, destinationView);
        return;
      }
    }
    setRegion();
    syncMobileHomeSelectionHud('');
    if (window.matchMedia('(max-width: 768px)').matches) {
      setMobileAppView(destinationView);
    } else {
      if (homeScreen) homeScreen.hidden = true;
      delete document.body.dataset.mobileView;
      map.resize();
    }
    if (homeScreen) homeScreen.hidden = true;
  }

  function initMobileHomeInteractions() {
    $('#homeRegionSelect')?.addEventListener('change', () => {
      const courseSel = $('#homeCourseSelect');
      if (courseSel) courseSel.value = '';
      renderMobileHome();
      if (mobileHomeMapMode === 'offline') void refreshOfflineRegionStatuses();
    });
    $('#homeCourseSelect')?.addEventListener('change', updateMobileHomeMeta);
    document.querySelectorAll('[data-home-map-mode]').forEach(button => {
      button.addEventListener('click', () => setMobileHomeMapMode(button.dataset.homeMapMode));
    });
    $('#homeOfflineRegionList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-offline-region-download]');
      if (!button || button.disabled) return;
      const id = button.dataset.offlineRegionDownload;
      if (offlineRegionDownloads.has(id) || offlineDownloadQueue.includes(id)) void cancelOfflineRegionDownload(id);
      else enqueueOfflineRegionDownload(id);
    });
    $('#homeRideOnBtn')?.addEventListener('click', () => {
      if (mobileHomeMapMode === 'offline') void openOfflineHomeRegion();
      else {
        void deactivateNativeMap();
        if (navigator.onLine === false) toast('인터넷에 연결되어 있지 않습니다. 이전에 본 지도 일부만 표시됩니다. 다운로드한 지도는 오프라인 3D로 이용해 주세요.');
        mobileHomeRideOn('ride');
      }
    });
    window.addEventListener('online', () => { void refreshMobileHomeCatalog(); });
    window.addEventListener('offline', () => {
      if (mobileHomeMapMode === 'offline') void refreshOfflineRegionStatuses();
    });
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
    $('#rideInfoBtn')?.addEventListener('click', () => $('#mobileMapProfileToggle')?.click());
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

  // Touch/drag on a profile chart selects a distance; map marker + vertical line follow in real time.
  // Graph x (client px) → cumulative route distance (m) within the currently shown distance window.
  function profileDistanceAtClientX(canvas, clientX) {
    const padLeft = 8, padRight = 8;
    const rect = canvas.getBoundingClientRect(), plotWidth = Math.max(1, rect.width - padLeft - padRight);
    const range = profileViewRange();
    return range.start + Math.max(0, Math.min(plotWidth, clientX - rect.left - padLeft)) / plotWidth * (range.end - range.start);
  }
  function bindProfileScrub(canvas) {
    if (!canvas || canvas.dataset.scrubBound) return;
    canvas.dataset.scrubBound = '1';
    canvas.style.touchAction = 'none';
    const ro = canvas.parentElement?.querySelector('.profile-tooltip'); // desktop tooltip only
    let dragging = false, toggleCandidate = false, downX = 0;
    const padLeft = 8, padRight = 8;
    const distanceAt = clientX => profileDistanceAtClientX(canvas, clientX);
    const selectedClientX = () => {
      const rect = canvas.getBoundingClientRect(), plotWidth = Math.max(1, rect.width - padLeft - padRight);
      const range = profileViewRange();
      return rect.left + padLeft + (profile.selected.distance - range.start) / Math.max(1, range.end - range.start) * plotWidth;
    };
    const update = e => {
      if (profile.samples.length < 2) return;
      const sample = selectProfileDistance(distanceAt(e.clientX));
      if (sample && ro) { ro.textContent = profileReadoutText(sample); ro.hidden = false; }
    };
    canvas.addEventListener('pointerdown', e => {
      if (gapCut && handleGapCutGraphClick(canvas, e.clientX)) { e.preventDefault(); return; } // PC 구간 자르기: A/B pick
      if (handleEditGraphClick(canvas, e.clientX)) { e.preventDefault(); return; } // PC edit tools: graph click → route position
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      downX = e.clientX;
      // Touching the already-selected point again (without dragging) clears it on release.
      toggleCandidate = e.pointerType !== 'mouse' && Boolean(profile.selected) && Math.abs(e.clientX - selectedClientX()) <= 14;
      if (!toggleCandidate) update(e);
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      e.preventDefault();
      if (toggleCandidate) { if (Math.abs(e.clientX - downX) < 6) return; toggleCandidate = false; }
      update(e);
    });
    canvas.addEventListener('pointerup', () => {
      if (dragging && toggleCandidate) { clearProfileCursor(); if (ro) ro.hidden = true; }
      dragging = false; toggleCandidate = false;
    });
    canvas.addEventListener('pointercancel', () => { dragging = false; toggleCandidate = false; });
  }

  function renderMobileCourseProfiles() {
    const samples = profile.samples;
    const hasProfile = samples.length > 1;
    const message = $('#profileMessage')?.textContent || '경로를 그리면 그래프가 표시됩니다.';
    for (const [canvasId, messageId] of [['#mobileRoutesProfileChart', '#mobileRoutesProfileMessage'], ['#mobileEditorProfileChart', '#mobileEditorProfileMessage'], ['#mobileMapProfileChart', '#mobileMapProfileMessage']]) {
      const canvas = $(canvasId), label = $(messageId);
      if (!canvas) continue;
      if (label) { label.hidden = hasProfile; label.textContent = message; }
      drawProfileChart(canvas);
      bindProfileScrub(canvas);
    }
    syncProfileHeaderReadouts();
    const distance = $('#profileDistance')?.textContent || '—', average = $('#profileAverage')?.textContent || '—', maximum = $('#profileMaximum')?.textContent || '—';
    $('#mobileRoutesDistance').textContent = distance;
    $('#mobileRoutesAverage').textContent = average;
    $('#mobileRoutesMaximum').textContent = maximum;
    if ($('#mobileMapDistance')) { $('#mobileMapDistance').textContent = distance; $('#mobileMapAverage').textContent = average; $('#mobileMapMaximum').textContent = maximum; }
    $('#mobileEditorDistance').textContent = distance;
    $('#mobileEditorElevation').textContent = hasProfile ? Math.round(samples.at(-1).elevation - samples[0].elevation) + ' m' : '—';
    $('#mobileEditorSlope').textContent = hasProfile ? maximum + ' / ' + average : '—';
  }

  function syncMobileRoutesActions() {
    const hasCourse = Boolean($('#mobileRoutesCourseSelect')?.value);
    const editBtn = $('#mobileRoutesEditBtn');
    const deleteBtn = $('#mobileRoutesDeleteBtn');
    if (editBtn) editBtn.disabled = !hasCourse;
    if (deleteBtn) {
      // Only courses the user created themselves get a delete button.
      const selected = hasCourse ? state.saved[Number($('#mobileRoutesCourseSelect').value)] : null;
      deleteBtn.hidden = hasCourse && !canDeleteSavedRoute(selected);
      deleteBtn.disabled = !hasCourse;
    }
  }

  function renderMobileSavedRoutes() {
    renderMobileHome();
    const region = $('#mobileRoutesRegion')?.value || $('#region').value;
    const courses = state.saved.map((route, index) => ({ route, index })).filter(({ route }) => !route.region || route.region === region);
    const select = $('#mobileRoutesCourseSelect');
    if (select) {
      select.innerHTML = '<option value="">코스 미선택</option>' + courses.map(({ route, index }) => `<option value="${index}">${escapeHtml(route.name)}${route.syncStatus === 'pending' ? ' · 동기화 대기' : ''}</option>`).join('');
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

// Rejects after `ms` so a hung request can never keep the `sending` / `polling` flags set forever.
function withPartyGpsTimeout(promiseLike, label, ms = PARTY_GPS_RPC_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promiseLike), timeout]).finally(() => clearTimeout(timer));
}

// Asks the device for a NEW position (never re-publishes an old one). Resolves true when a fix was received.
function requestFreshPartyGpsFix() {
  if (partyGpsRuntime.freshFixRequesting || typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(false);
  }
  partyGpsRuntime.freshFixRequesting = true;
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      partyGpsRuntime.freshFixRequesting = false;
      resolve(ok);
    };
    try {
      navigator.geolocation.getCurrentPosition(
        pos => { handlePartyGpsCoords(pos.coords, pos.timestamp); finish(true); },
        err => { console.warn('Party GPS fresh fix error:', err); finish(false); },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: PARTY_GPS_FRESH_FIX_TIMEOUT_MS }
      );
    } catch (err) {
      console.warn('Party GPS fresh fix failed:', err);
      finish(false);
    }
    setTimeout(() => finish(false), PARTY_GPS_FRESH_FIX_TIMEOUT_MS + 3000);
  });
}

// Exponential backoff after a failed upload so GPS events / timer ticks do not hammer the server.
function notePartyGpsSendFailure() {
  partyGpsRuntime.sendFailCount += 1;
  const delay = Math.min(PARTY_GPS_SEND_BACKOFF_MAX_MS, PARTY_GPS_SEND_BACKOFF_BASE_MS * 2 ** Math.min(partyGpsRuntime.sendFailCount - 1, 5));
  partyGpsRuntime.nextSendAllowedAt = Date.now() + delay;
}

async function sendCurrentPartyGpsFix(force = false) {
  const party = state.currentParty;
  const client = supabaseClient;
  const userId = state.session?.user?.id;
  const fix = partyGpsRuntime.lastFix;
  if (!party?.id || !client || !userId || state.profile?.status !== 'approved') return;
  if (!isMyPartyLocationSharingEnabled(party) || !fix || partyGpsRuntime.sending) return;
  if (Date.now() < partyGpsRuntime.nextSendAllowedAt) return;
  const fixTimestamp = Number(fix.timestamp);
  if (!Number.isFinite(fixTimestamp)
      || Math.abs(Date.now() - fixTimestamp) > PARTY_GPS_FIX_MAX_AGE_MS
      || fixTimestamp <= partyGpsRuntime.lastSentFixTimestamp) return;
  const intervalMs = partyGpsRuntime.powerSaveMode
    ? PARTY_GPS_STATIONARY_INTERVAL_MS
    : sanitizePartyGpsInterval(party.gps_interval_seconds) * 1000;
  if (!force && partyGpsRuntime.lastSentAt && (Date.now() - partyGpsRuntime.lastSentAt) < Math.max(3000, intervalMs - 500)) {
    return;
  }
  partyGpsRuntime.sending = true;
  try {
    const { data, error } = await withPartyGpsTimeout(client.rpc('upsert_my_party_location', {
      p_party_id: party.id,
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy_m: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
      p_heading: Number.isFinite(fix.heading) ? fix.heading : null,
      p_speed_mps: Number.isFinite(fix.speed) ? fix.speed : null
    }), 'upsert_my_party_location');
    if (client !== supabaseClient || state.currentParty !== party) return;
    if (error) {
      console.warn('upsert_my_party_location error:', error);
      notePartyGpsSendFailure();
      return;
    }
    partyGpsRuntime.sendFailCount = 0;
    partyGpsRuntime.nextSendAllowedAt = 0;
    const updatedIso = typeof data === 'string' && data ? data : new Date().toISOString();
    partyGpsRuntime.lastSentAt = Date.now();
    partyGpsRuntime.lastSentFixTimestamp = fixTimestamp;
    if (partyGpsRuntime.lastFix?.timestamp === fix.timestamp) {
      partyGpsRuntime.lastFix = { ...fix, updatedAt: updatedIso };
      applyLocalMemberFix(party, userId, fix, updatedIso);
      syncPartyMemberMapMarkers();
      refreshVisiblePartyScreens();
    }
  } catch (err) {
    console.warn('upsert_my_party_location error:', err);
    notePartyGpsSendFailure();
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
    const { rows, hasLocationRpc } = await withPartyGpsTimeout(
      fetchMyPartyMemberRows(client, party.id), 'list_my_party_member_locations'
    );
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
  const measuredAt = Number.isFinite(Number(timestamp)) ? Number(timestamp) : now;
  const nextFix = {
    lat,
    lng,
    accuracy,
    heading,
    speed,
    timestamp: measuredAt,
    // Shown time = when the position was measured, so an old cached coordinate never looks like a new reading.
    updatedAt: new Date(measuredAt <= now ? measuredAt : now).toISOString()
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
        schedulePartyGpsSendTimer();
        sendCurrentPartyGpsFix(true);
        return;
      }
    } else if (!partyGpsRuntime.powerSaveMode && (now - partyGpsRuntime.anchorFix.since) >= PARTY_GPS_STATIONARY_HOLD_MS) {
      partyGpsRuntime.powerSaveMode = true;
      schedulePartyGpsSendTimer();
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
  if (partyGpsRuntime.watchRetryTimer !== null) {
    clearTimeout(partyGpsRuntime.watchRetryTimer);
    partyGpsRuntime.watchRetryTimer = null;
  }
  partyGpsRuntime.watchId = null;
  partyGpsRuntime.watchRetryCount = 0;
  partyGpsRuntime.anchorFix = null;
  partyGpsRuntime.powerSaveMode = false;
  partyGpsRuntime.lastSentAt = 0;
}

function stopPartyGpsRuntime({ clearMarkers = false } = {}) {
  stopPartyGpsWatcher();
  if (partyGpsRuntime.sendTimer !== null) {
    clearInterval(partyGpsRuntime.sendTimer);
    partyGpsRuntime.sendTimer = null;
  }
  if (partyGpsRuntime.pollTimer !== null) {
    clearInterval(partyGpsRuntime.pollTimer);
    partyGpsRuntime.pollTimer = null;
  }
  partyGpsRuntime.partyId = '';
  partyGpsRuntime.sendFailCount = 0;
  partyGpsRuntime.nextSendAllowedAt = 0;
  if (clearMarkers) clearPartyMemberMapMarkers();
}

// App back in the foreground / network reconnected: make sure the GPS watch and timers are alive, then fetch
// the latest member locations and upload a fresh own position right away.
function recoverPartyGpsRuntime() {
  const party = state.currentParty;
  if (!party?.id || !state.session?.user || state.profile?.status !== 'approved') return;
  if (document.hidden || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const now = Date.now();
  if (now - partyGpsRuntime.lastRecoverAt < PARTY_GPS_RECOVER_MIN_GAP_MS) return;
  partyGpsRuntime.lastRecoverAt = now;
  partyGpsRuntime.nextSendAllowedAt = 0; // connectivity may be back: allow one retry immediately

  const sharing = isMyPartyLocationSharingEnabled(party);
  if (sharing) {
    // A watch that produced nothing for longer than the fix lifetime may be dead (e.g. after backgrounding).
    const lastFix = partyGpsRuntime.lastFix;
    if (partyGpsRuntime.watchId !== null && (!lastFix || now - Number(lastFix.timestamp) > PARTY_GPS_FIX_MAX_AGE_MS)
        && typeof navigator !== 'undefined' && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(partyGpsRuntime.watchId); } catch {}
      partyGpsRuntime.watchId = null;
    }
    if (partyGpsRuntime.watchId === null) {
      partyGpsRuntime.watchRetryCount = 0;
      startPartyGpsWatcher();
    }
  }
  if (partyGpsRuntime.pollTimer === null || (sharing && partyGpsRuntime.sendTimer === null)) schedulePartyGpsTimer();

  refreshCurrentPartyMemberLocations();
  if (sharing) requestFreshPartyGpsFix().then(() => sendCurrentPartyGpsFix(true));
}

function registerPartyGpsLifecycleListeners() {
  if (partyGpsLifecycleListenersRegistered || typeof document === 'undefined') return;
  partyGpsLifecycleListenersRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recoverPartyGpsRuntime();
  });
  window.addEventListener('online', recoverPartyGpsRuntime);
}

function schedulePartyGpsWatcherRetry() {
  if (partyGpsRuntime.watchRetryTimer !== null || !isMyPartyLocationSharingEnabled()
      || !state.session?.user || state.profile?.status !== 'approved') return;
  const delay = Math.min(60000, 5000 * 2 ** Math.min(partyGpsRuntime.watchRetryCount, 4));
  partyGpsRuntime.watchRetryCount += 1;
  partyGpsRuntime.watchRetryTimer = setTimeout(() => {
    partyGpsRuntime.watchRetryTimer = null;
    if (isMyPartyLocationSharingEnabled()) startPartyGpsWatcher();
  }, delay);
}

function startPartyGpsWatcher() {
  if (partyGpsRuntime.watchId !== null || typeof navigator === 'undefined' || !navigator.geolocation) return;
  if (partyGpsRuntime.watchRetryTimer !== null) {
    clearTimeout(partyGpsRuntime.watchRetryTimer);
    partyGpsRuntime.watchRetryTimer = null;
  }
  try {
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        if (partyGpsRuntime.watchId !== watchId) return;
        partyGpsRuntime.watchRetryCount = 0;
        handlePartyGpsCoords(pos.coords, pos.timestamp);
      },
      err => {
        if (partyGpsRuntime.watchId !== watchId) return;
        console.warn('Party GPS watch error:', err);
        try { navigator.geolocation.clearWatch(watchId); } catch {}
        partyGpsRuntime.watchId = null;
        if (err?.code !== 1) schedulePartyGpsWatcherRetry();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    partyGpsRuntime.watchId = watchId;
  } catch (err) {
    console.warn('Failed to start party GPS watch:', err);
    if (err?.name !== 'SecurityError') schedulePartyGpsWatcherRetry();
  }
}

function schedulePartyGpsSendTimer() {
  if (partyGpsRuntime.sendTimer !== null) {
    clearInterval(partyGpsRuntime.sendTimer);
    partyGpsRuntime.sendTimer = null;
  }
  const party = state.currentParty;
  if (!party?.id || !state.session?.user || state.profile?.status !== 'approved'
      || !isMyPartyLocationSharingEnabled(party)) return;
  const normalIntervalMs = sanitizePartyGpsInterval(party.gps_interval_seconds) * 1000;
  const tickMs = partyGpsRuntime.powerSaveMode
    ? PARTY_GPS_STATIONARY_INTERVAL_MS
    : normalIntervalMs;
  partyGpsRuntime.sendTimer = setInterval(() => {
    if (!state.currentParty || state.currentParty.id !== party.id) return;
    if (isMyPartyLocationSharingEnabled(state.currentParty)) {
      if (partyGpsRuntime.lastFix && !partyGpsRuntime.powerSaveMode && partyGpsRuntime.anchorFix) {
        if ((Date.now() - partyGpsRuntime.anchorFix.since) >= PARTY_GPS_STATIONARY_HOLD_MS) {
          partyGpsRuntime.powerSaveMode = true;
          schedulePartyGpsSendTimer();
          refreshVisiblePartyScreens();
        }
      }
      // A stationary device may stop emitting watch events. If the last fix is old or was already uploaded,
      // take a real new measurement first; if that fails nothing is sent (stale coordinates are never published).
      const lastFix = partyGpsRuntime.lastFix;
      const fixAge = lastFix ? Date.now() - Number(lastFix.timestamp) : Infinity;
      if (!lastFix || fixAge > PARTY_GPS_FIX_MAX_AGE_MS - 15000 || Number(lastFix.timestamp) <= partyGpsRuntime.lastSentFixTimestamp) {
        requestFreshPartyGpsFix().then(() => sendCurrentPartyGpsFix(true));
      } else {
        sendCurrentPartyGpsFix(true);
      }
    }
  }, tickMs);
}

function schedulePartyGpsPollTimer() {
  if (partyGpsRuntime.pollTimer !== null) {
    clearInterval(partyGpsRuntime.pollTimer);
    partyGpsRuntime.pollTimer = null;
  }
  const party = state.currentParty;
  if (!party?.id || !state.session?.user || state.profile?.status !== 'approved') return;
  const intervalMs = sanitizePartyGpsInterval(party.gps_interval_seconds) * 1000;
  partyGpsRuntime.pollTimer = setInterval(() => {
    if (state.currentParty?.id === party.id) refreshCurrentPartyMemberLocations();
  }, intervalMs);
}

function schedulePartyGpsTimer() {
  schedulePartyGpsSendTimer();
  schedulePartyGpsPollTimer();
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
    partyGpsRuntime.lastSentFixTimestamp = 0;
  }
  partyGpsRuntime.partyId = party.id;
  registerPartyGpsLifecycleListeners();
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
      state.points = prepareEditPoints(item.points);
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
      if (item.syncStatus === 'pending') {
        toast('서버 동기화가 완료되기 전에는 기록 코스를 삭제할 수 없습니다.');
        return;
      }
      if (!canDeleteSavedRoute(item)) { toast('직접 만든 코스만 삭제할 수 있습니다.'); return; }
      const confirmMsg = state.lang === 'ko' ? `"${item.name}" 코스를 삭제하시겠습니까?` : `Delete course "${item.name}"?`;
      if (!window.confirm(confirmMsg)) return;

      if (!(await deleteSavedRoute(item))) return;

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
    $('#mobileRoutesCompassBtn')?.addEventListener('click', () => { if (!nativeCameraCommand('north')) map.easeTo({ bearing: 0, pitch: 0, duration: 600 }); });
    $('#mobileRoutesZoomInBtn')?.addEventListener('click', () => { if (!nativeCameraCommand('zoomIn')) map.zoomIn({ duration: 300 }); });
    $('#mobileRoutesZoomOutBtn')?.addEventListener('click', () => { if (!nativeCameraCommand('zoomOut')) map.zoomOut({ duration: 300 }); });
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
    for (const [toggleId, bodyId] of [['#mobileRoutesProfileToggle', '#mobileRoutesProfileBody'], ['#mobileEditorProfileToggle', '#mobileEditorProfileBody'], ['#mobileMapProfileToggle', '#mobileMapProfileBody']]) {
      $(toggleId)?.addEventListener('click', e => {
        const body = $(bodyId);
        body.hidden = !body.hidden;
        e.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
        $('.map-panel')?.classList.toggle('mobile-profile-expanded', !$('#mobileMapProfileBody')?.hidden);
        syncProfileHeaderReadouts();
        if (body.hidden) clearProfileCursor(); else requestAnimationFrame(renderMobileCourseProfiles);
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
    splitState.restore?.(); // drop the temporary cut-point history entry; the delete below is a single undo step
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
    splitState.restore?.();
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
    splitState.restore?.();
    closeSplitHUD();
    render();
    toast(state.lang === 'ko' ? '구간 나누기를 취소했습니다.' : 'Cancelled route split.');
  }

  function initSplitHUDInteractions() {
    $('#splitDeleteABtn')?.addEventListener('click', deletePartA);
    $('#splitDeleteBBtn')?.addEventListener('click', deletePartB);
    $('#splitCancelBtn')?.addEventListener('click', cancelSplit);
  }

  let androidBackButtonRegistered = false;
  let exitConfirmationOpen = false;

  function clickVisibleControl(containerId, controlId) {
    const container = $(containerId);
    if (!container || container.hidden) return false;
    $(controlId)?.click();
    return true;
  }

  async function handleAndroidBackButton(appPlugin) {
    if (!introPlaybackComplete) {
      $('#mobileIntroSkipBtn')?.click();
      return true;
    }

    if (!$('#gpsRecordingFinishModal')?.hidden) {
      toast('저장 또는 저장 안 함을 선택해 기록 종료를 완료하세요.');
      return true;
    }

    const modalCloseControls = [
      ['#confirmModal', '#modalCancelBtn'],
      ['#signupModal', '#closeSignupModalBtn'],
      ['#partyCreateCourseModal', '#partyCreateCourseCloseBtn'],
      ['#partyJoinedLeaveModal', '#partyJoinedLeaveCloseBtn'],
      ['#partyLeaderDisbandModal', '#partyLeaderDisbandCloseBtn']
    ];
    for (const [modalId, closeId] of modalCloseControls) {
      if (clickVisibleControl(modalId, closeId)) return true;
    }

    if (clickVisibleControl('#stitchAdminCoursePreview', '#stitchAdminCoursePreviewCloseBtn')) return true;
    if (clickVisibleControl('#adminRegionMapPicker', '#adminRegionPickerCancelBtn')) return true;
    if (!$('#courseSplitHUD')?.hidden) {
      $('#splitCancelBtn')?.click();
      return true;
    }

    if (document.body.dataset.mobileAuth === 'signup') {
      $('#mobileSignupBackBtn')?.click();
      return true;
    }

    const mobileView = document.body.dataset.mobileView || 'home';
    if (mobileView === 'account') {
      const accountBackControls = [
        ['#mobileAdminCoursesView', '#stitchAdminCoursesBackBtn'],
        ['#mobileAdminRegionsView', '#stitchAdminRegionsBackBtn'],
        ['#mobileAdminUsersView', '#stitchAdminUsersBackBtn'],
        ['#mobileAdminManageView', '#stitchAdminManageHeaderBackBtn'],
        ['#mobileDeleteAccountView', '#stitchDeleteAccountBackBtn']
      ];
      for (const [viewId, backId] of accountBackControls) {
        if (clickVisibleControl(viewId, backId)) return true;
      }
    }

    const partyBackControls = {
      'party-create': '#partyCreateBackBtn',
      'party-leader': '#partyLeaderBackBtn',
      'party-invite': '#partyInviteBackBtn',
      'party-joined': '#partyJoinedBackBtn',
      'party-received': '#partyReceivedBackBtn'
    };
    if (partyBackControls[mobileView]) {
      $(partyBackControls[mobileView])?.click();
      return true;
    }

    if (mobileView === 'course-editor') {
      requestCloseCourseEditor();
      return true;
    }
    if (mobileView === 'ride') {
      $('#rideExitBtn')?.click();
      return true;
    }
    // Previous menu from the view history (no repeated ping-pong between the same screens).
    if (goBackInAppHistory(mobileView)) return true;
    if (!['home', 'map'].includes(mobileView)) {
      state.backNavigating = true;
      try { setMobileAppView('home'); } finally { state.backNavigating = false; }
      return true;
    }

    if (!appPlugin) return false; // plain browser: let the browser leave the page
    if (exitConfirmationOpen) return true;
    exitConfirmationOpen = true;
    try {
      if (window.confirm('POWDERLINE 앱을 종료하시겠습니까?')) await appPlugin.exitApp();
    } finally {
      exitConfirmationOpen = false;
    }
  }

  function goBackInAppHistory(currentView) {
    while (state.viewStack.length) {
      const previous = state.viewStack.pop();
      if (!previous || previous === currentView) continue;
      state.backNavigating = true;
      try { setMobileAppView(previous); } finally { state.backNavigating = false; }
      return true;
    }
    return false;
  }

  // Plain browsers: keep one guard history entry so the browser back button runs the same in-app back logic.
  function initBrowserBackGuard() {
    if (window.Capacitor?.getPlatform?.() === 'android') return;
    const guard = () => { try { history.pushState({ plGuard: true }, ''); } catch { } };
    try { history.replaceState({ plBase: true }, ''); } catch { return; }
    guard();
    window.addEventListener('popstate', async () => {
      const consumed = await handleAndroidBackButton(null);
      if (consumed) guard(); else history.back();
    });
  }

  function initAndroidBackButton() {
    const capacitor = window.Capacitor;
    const appPlugin = capacitor?.Plugins?.App;
    if (androidBackButtonRegistered || capacitor?.getPlatform?.() !== 'android' || !appPlugin?.addListener) return;
    androidBackButtonRegistered = true;
    try {
      const listenerRegistration = appPlugin.addListener('backButton', () => {
        void handleAndroidBackButton(appPlugin);
      });
      if (listenerRegistration && typeof listenerRegistration.then === 'function') {
        listenerRegistration.catch(error => {
          androidBackButtonRegistered = false;
          console.warn('Android back button listener registration failed:', error);
        });
      }
    } catch (error) {
      androidBackButtonRegistered = false;
      console.warn('Android back button listener registration failed:', error);
    }
  }

  function initAuthConnectivityRevalidation() {
    if (authConnectivityListenersRegistered) return;
    authConnectivityListenersRegistered = true;
    window.addEventListener('online', () => {
      if (offlineAccessActive) revalidateOfflineAccess();
      else void syncPendingGpsRoutes();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && offlineAccessActive && navigator.onLine !== false) revalidateOfflineAccess();
      else if (!document.hidden && navigator.onLine !== false) void syncPendingGpsRoutes();
      if (!document.hidden && navigator.onLine !== false) void refreshMobileHomeCatalog();
    });
  }

  initSplitHUDInteractions();
  initStitchAccountInteractions();
  initMobileHomeInteractions();
  initMobileStandaloneInteractions();
  initGpsRecordingInteractions();
  initAndroidBackButton();
  initBrowserBackGuard();
  initAuthConnectivityRevalidation();

  initializeSupabase().finally(() => { void restoreGpsRecording(); });
  // Android: regions downloaded on this device are known right at start-up, without waiting for the server.
  if (getOfflineMapTestPlugin()?.listOfflineRegions) void ensureLocalOfflineCatalog();
})();
