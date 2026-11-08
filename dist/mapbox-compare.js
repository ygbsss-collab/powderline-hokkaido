;(async()=>{
const FURANO_CAMERA={center:[142.355,43.325],zoom:11,bearing:16,pitch:54};
const TERRAIN_EXAGGERATION=1.25;
const MAPBOX_STYLES={satellite:{url:'mapbox://styles/mapbox/standard-satellite',label:'Standard Satellite'},streets:{url:'mapbox://styles/mapbox/streets-v12',label:'Streets v12'}};
const appConfig=window.POWDERLINE_CONFIG||{};
const SUPABASE_URL=appConfig.supabaseUrl||'https://lxfsvhwibiaspnaduhri.supabase.co';
const SUPABASE_KEY_STORAGE='powderline.supabasePublishableKey';
const storedSupabaseKey=localStorage.getItem(SUPABASE_KEY_STORAGE)||'';
const SUPABASE_PUBLISHABLE_KEY=storedSupabaseKey.startsWith('sb_publishable_')||storedSupabaseKey.startsWith('eyJ')?storedSupabaseKey:appConfig.supabasePublishableKey||'';
const MAPBOX_TOKEN_KEY='powderline.mapboxCompareToken';
const MAPBOX_TOKEN_FUNCTION_URL=`${SUPABASE_URL}/functions/v1/mapbox-public-token`;
const $=selector=>document.querySelector(selector);
const gsiAttribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">GSI Japan</a>';
const terrainAttribution='<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Open Data Terrain Tiles</a>';
const maplibreStyle={version:8,sources:{satellite:{type:'raster',tiles:['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],tileSize:256,maxzoom:18,attribution:gsiAttribution}},layers:[{id:'satellite',type:'raster',source:'satellite'}]};
const currentMap=new maplibregl.Map({container:'maplibreMap',style:maplibreStyle,...FURANO_CAMERA,antialias:true,maxPitch:75});
currentMap.addControl(new maplibregl.NavigationControl({showCompass:true}),'bottom-right');
currentMap.on('load',()=>{currentMap.addSource('terrain',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:terrainAttribution});currentMap.setTerrain({source:'terrain',exaggeration:TERRAIN_EXAGGERATION})});
let candidateMap=null;
let syncing=false;
function cameraOf(map){return {center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()}}
function syncCamera(source,target){if(syncing||!target)return;syncing=true;target.jumpTo(cameraOf(source));requestAnimationFrame(()=>{syncing=false})}
currentMap.on('move',()=>syncCamera(currentMap,candidateMap));
function showMessage(message){const element=$('#mapboxMessage');if(element)element.textContent=message}
function setDiagnostic(id,value,title=''){const element=$(id);element.textContent=value;element.title=title||value}
function getCachedMapboxToken(){const token=localStorage.getItem(MAPBOX_TOKEN_KEY)||localStorage.getItem('powderline.mapboxToken')||'';return token.startsWith('pk.')?token:''}
async function loadMapboxToken(){const cachedToken=getCachedMapboxToken();try{if(!SUPABASE_PUBLISHABLE_KEY)throw new Error('Supabase publishable key is unavailable');const response=await fetch(MAPBOX_TOKEN_FUNCTION_URL,{method:'GET',headers:{Accept:'application/json',apikey:SUPABASE_PUBLISHABLE_KEY},cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json();const token=typeof payload?.token==='string'?payload.token.trim():'';if(!token.startsWith('pk.'))throw new Error('Invalid public token response');localStorage.setItem(MAPBOX_TOKEN_KEY,token);localStorage.removeItem('powderline.mapboxToken');sessionStorage.removeItem(MAPBOX_TOKEN_KEY);return token}catch(error){console.warn('Mapbox token auto-load failed; using the last saved token when available.',error);return cachedToken}}
function redactToken(value){return String(value||'').replace(/([?&]access_token=)[^&\s]+/gi,'$1[redacted]')}
function errorDetails(event){const error=event.error||{},message=String(error.message||event.message||'Unknown Mapbox error');const status=error.status||error.statusCode||error.response?.status||message.match(/\b(?:HTTP\s*)?(\d{3})\b/i)?.[1]||'unknown';const rawUrl=error.url||error.request?.url||error.response?.url||message.match(/https?:\/\/[^\s)]+/)?.[0]||'';const resourceText=`${rawUrl} ${message} ${event.sourceId||''}`.toLowerCase();let resource='Mapbox resource';if(/terrain-dem|mapbox-dem/.test(resourceText))resource='Terrain-DEM';else if(/mapbox\.satellite|satellite.*tile|\/raster\/|\.webp/.test(resourceText))resource='Satellite raster tile';else if(/styles\/v1|standard-satellite|streets-v12/.test(resourceText))resource='Style';else if(/glyph/.test(resourceText))resource='Glyph';else if(/sprite/.test(resourceText))resource='Sprite';else if(/\.mvt|vector|composite/.test(resourceText))resource='Vector tile';return {status,resource,url:redactToken(rawUrl||event.sourceId||message)}}
function loadMapbox(token){if(!token.startsWith('pk.')){showMessage('Mapbox token is unavailable. Reconnect and reload to retry.');return}const styleKey=$('#mapboxStyle').value,style=MAPBOX_STYLES[styleKey];sessionStorage.setItem('powderline.mapboxCompareStyle',styleKey);if(candidateMap){candidateMap.remove();candidateMap=null}$('#mapboxMap').innerHTML='';$('#mapboxMap').classList.remove('map-placeholder');$('#candidateLabel').textContent=`Mapbox GL JS · ${style.label} · Terrain-DEM`;setDiagnostic('#diagStyle',`Loading ${style.label}…`);setDiagnostic('#diagTerrain','Waiting for style…');setDiagnostic('#diagError','None');setDiagnostic('#diagResource','—');mapboxgl.accessToken=token;const mapInstance=new mapboxgl.Map({container:'mapboxMap',style:style.url,...FURANO_CAMERA,antialias:true,maxPitch:75});candidateMap=mapInstance;mapInstance.addControl(new mapboxgl.NavigationControl({showCompass:true}),'bottom-right');mapInstance.on('style.load',()=>{if(candidateMap!==mapInstance)return;setDiagnostic('#diagStyle',`${style.label} loaded`);setDiagnostic('#diagTerrain','Loading metadata and tiles…');if(!mapInstance.getSource('mapbox-dem'))mapInstance.addSource('mapbox-dem',{type:'raster-dem',url:'mapbox://mapbox.mapbox-terrain-dem-v1',tileSize:512,maxzoom:14});mapInstance.setTerrain({source:'mapbox-dem',exaggeration:TERRAIN_EXAGGERATION})});mapInstance.on('sourcedata',event=>{if(candidateMap===mapInstance&&event.sourceId==='mapbox-dem'&&event.isSourceLoaded)setDiagnostic('#diagTerrain','Loaded and rendering')});mapInstance.on('move',()=>syncCamera(mapInstance,currentMap));mapInstance.on('error',event=>{if(candidateMap!==mapInstance)return;const details=errorDetails(event);setDiagnostic('#diagError',`HTTP ${details.status} · ${details.resource}`);setDiagnostic('#diagResource',details.url,details.url)})}
let mapboxToken='';
$('#mapboxStyle').addEventListener('change',()=>{if(mapboxToken)loadMapbox(mapboxToken)});
$('#resetCamera').addEventListener('click',()=>{currentMap.jumpTo(FURANO_CAMERA);if(candidateMap)candidateMap.jumpTo(FURANO_CAMERA)});
const sessionStyle=sessionStorage.getItem('powderline.mapboxCompareStyle');
if(MAPBOX_STYLES[sessionStyle])$('#mapboxStyle').value=sessionStyle;
mapboxToken=await loadMapboxToken();
if(mapboxToken){$('#tokenLoadStatus').textContent='Mapbox token loaded automatically.';loadMapbox(mapboxToken)}else{$('#tokenLoadStatus').textContent='Mapbox token could not be loaded.';showMessage('Mapbox token is unavailable. Reconnect and reload to retry.')}
})();
