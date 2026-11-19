// Weather-region snapshot read from public.powderline_regions on 2026-11-19 (read-only).
// IDs are database IDs and must not be renamed. The Dongtan test region is explicitly excluded.
// Point elevations come from the existing OpenSkiData terrain GeoJSON and were checked once against
// Open-Meteo Copernicus GLO-90 DEM. Runtime collection does not repeat the elevation request.

const point = (pointType, latitude, longitude, elevation, demElevation, derivation) => ({
  point_type: pointType,
  latitude,
  longitude,
  elevation,
  elevation_source: 'openskidata_geojson',
  dem_elevation: demElevation,
  dem_source: 'open-meteo elevation (Copernicus GLO-90)',
  dem_diff: Number((elevation - demElevation).toFixed(1)),
  derivation,
  status: Math.abs(elevation - demElevation) <= 50 ? 'confirmed' : 'needs_review',
  issues: Math.abs(elevation - demElevation) <= 50 ? [] : ['source elevation differs from DEM by more than 50 m']
});

const p = (type, lat, lng, elevation, dem, method, name = null, featureId = null) =>
  point(type, lat, lng, elevation, dem, {method, name, feature_id: featureId});

export const excludedWeatherRegions = [{
  id: 'region_5n0cllub',
  label: '동탄 test 지역',
  reason: 'explicitly excluded from weather collection'
}];

export const weatherRegions = [
  {
    id: 'asahidake', label: '아사히다케', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'dist/data/ski/asahidake.geojson',
    points: [
      p('summit', 43.661924, 142.824645, 1589.2, 1574, 'highest operating lift endpoint', '大雪山旭岳ロープウェイ, Daisetsuzan Asahidake Ropeway', '8f17970f5c5882f3a91237badc4cedd01c5ae4ef'),
      p('mid', 43.654378, 142.820837, 1347.6, 1361, 'operating downhill run vertex closest to (summit + base) / 2', 'A', '5b4c50050cb72313edae182bf50db75a400beb23'),
      p('base', 43.653059, 142.798883, 1105.3, 1108, 'lowest operating lift endpoint', '大雪山旭岳ロープウェイ, Daisetsuzan Asahidake Ropeway', '8f17970f5c5882f3a91237badc4cedd01c5ae4ef')
    ]
  },
  {
    id: 'rusutsu', label: '루스츠', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'dist/data/ski/rusutsu.geojson',
    points: [
      p('summit', 42.710154, 140.923364, 987.8, 987, 'highest operating lift endpoint', 'イゾラ第３クワッド, Isola No3 Quad', 'f2c29a9968138620aa2a950042ebe9083bcbb45d'),
      p('mid', 42.723417, 140.915176, 700.6, 696, 'operating downhill run vertex closest to (summit + base) / 2', 'イーストティーニュコース, East Tignes', '5802fd04a3ccf7d02e1c8f98ec96b09e30b73298'),
      p('base', 42.746528, 140.903075, 414.2, 418, 'lowest operating lift endpoint', 'タワーペアリフト, Tower Pair Lift', '75bd8e044a2bd7283b97493896854bf2798cedd7')
    ]
  },
  {
    id: 'furano', label: '후라노', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'dist/data/ski/furano.geojson',
    points: [
      p('summit', 43.324315, 142.31925, 1064, 1054, 'highest operating lift endpoint', 'ダウンヒル第3ロマンス, Downhill Romance No. 3', 'd0badc7be8680405403e98ca046fb5d84fd42e16'),
      p('mid', 43.340821, 142.336083, 650.1, 662, 'operating downhill run vertex closest to (summit + base) / 2', '林間, Rinkan', '107ce8cb85f7c97e4ed9b8525873b7f08fba9685'),
      p('base', 43.343902, 142.360112, 235.1, 237, 'lowest operating lift endpoint', '北の峰ゴンドラ, Kitanomine Gondola', 'd58721f9fda06067dfa275b32b1783acb0f489d5')
    ]
  },
  {
    id: 'niseko', label: '니세코', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'dist/data/ski/niseko.geojson',
    points: [
      p('summit', 42.870818, 140.662403, 1183.2, 1216, 'highest operating lift endpoint', 'エース第4ペア, Ace Pair #4', '43c9ef2f009c4d37ad70d89c94ae8e637eac2475'),
      p('mid', 42.877907, 140.677123, 720.7, 720, 'operating downhill run vertex closest to (summit + base) / 2', 'Renraku', 'a1426587bccc3133636b092795fcd3e0191bf2db'),
      p('base', 42.858345, 140.70201, 257, 274, 'lowest operating lift endpoint', 'エースファミリークワッド, Ace Family Quad #1', '1de1c9165ef3f51abc9f5ed82bb1d4d8961ac16d')
    ]
  },
  {
    id: 'kamui', label: '카무이 스키 링크스', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'dist/data/ski/kamui.geojson',
    points: [
      p('summit', 43.695283, 142.2123, 731.7, 715, 'highest operating lift endpoint', 'カムイゴンドラ, Kamui Gondola', '91648c373905b6e6e0b30e4bc4a263dc3c2cd1ea'),
      p('mid', 43.696735, 142.199194, 438.2, 435, 'operating downhill run vertex closest to (summit + base) / 2', 'ゴールド2, Gold 2', '825450f96d7f23dce14af278bee713187a002ae7'),
      p('base', 43.702764, 142.186448, 146, 143, 'lowest operating lift endpoint', '第1ペアリフト, Double Chair #1', 'e8b3d21d9747a8bddf05bd799389ef153feb80a4')
    ]
  },
  {
    id: 'kiroro', label: '키로로', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'dist/data/ski/kiroro.geojson',
    points: [
      p('summit', 43.056666, 141.026695, 1179.7, 1173, 'highest operating lift endpoint', 'キロロゴンドラ, Kiroro Gondola', 'abb2bb5acf61f694009de12e43178f7390107ebc'),
      p('mid', 43.05898, 141.004596, 851, 845, 'operating downhill run vertex closest to (summit + base) / 2', 'エキスパートA, Expert A', 'df1eca7e726538bcc0ffa094b5f6027501e5aec3'),
      p('base', 43.07451, 140.984378, 522.8, 520, 'lowest operating lift endpoint', 'ゲートウェイエクスプレス, Gateway Express', '46e452aaf108659824662dff007521ab5694085a')
    ]
  },
  {
    id: 'dontan', label: '사호로리조트', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'supabase://ski-data/dontan.geojson',
    points: [
      p('summit', 43.173908, 142.780719, 1043.5, 1040, 'highest operating lift endpoint', 'サホロエキスプレス, Sahoro Express', '61960111a1389c5dec1766d14a854064ce34ba4a'),
      p('mid', 43.178137, 142.793968, 726, 756, 'interpolated operating downhill segment at midpoint elevation', 'North Way', '02d3853521bf6fa73a388ec02bd9e2d499a3b689'),
      p('base', 43.167, 142.811482, 408.4, 422, 'lowest operating lift endpoint', '#1 High Speed Lift', '7c167ce12b3ed846a30cc3db9f3faf5b11df5246')
    ]
  },
  {
    id: 'abcdef', label: '웰리힐리', country: 'KR', timezone: 'Asia/Seoul',
    terrain_source: 'supabase://ski-data/abcdef.geojson',
    terrain_note: 'Feature coordinates match the registered Welli Hilli bbox, but the stored skiAreas label says Alpensia; metadata needs correction.',
    points: [
      p('summit', 37.480385, 128.243753, 885.4, 868, 'highest operating lift endpoint', '곤돌라', '6ddb5fb796b3990201ffb39adac7f2fbc04ae933'),
      p('mid', 37.484056, 128.241753, 729.8, 721, 'interpolated operating lift segment at midpoint elevation', '에코 리프트 (상급)', 'fb2fe84df02693d7fdaed9da1dd17394031490e8'),
      p('base', 37.490039, 128.249176, 574.2, 577, 'lowest operating lift endpoint', '델타 리프트 (초중급)', '2c42ac7a9c43f80034009e054bc7ff011bf81764')
    ]
  },
  {
    id: 'yongpyong', label: '모나용평', country: 'KR', timezone: 'Asia/Seoul',
    terrain_source: 'supabase://ski-data/yongpyong.geojson',
    points: [
      p('summit', 37.611908, 128.671877, 1436.8, 1421, 'highest operating lift endpoint', '레인보우 곤돌라, Rainbow Gondola', '294e6acc1fdbfb4094538aa5f3eab3da211bcd54'),
      p('mid', 37.618163, 128.6636, 1096, 1080, 'interpolated operating downhill segment at midpoint elevation', '레인보우4, Rainbow IV', '11c35476fce13893e1b1fb61669b2801d860bdfb'),
      p('base', 37.644386, 128.68063, 755.1, 756, 'lowest operating lift endpoint', null, '2b0df2bf0eb3241fec6775b386275f27673aa976')
    ]
  },
  {
    id: 'phoenix', label: '휘닉스파크', country: 'KR', timezone: 'Asia/Seoul',
    terrain_source: 'supabase://ski-data/phoenix.geojson',
    points: [
      p('summit', 37.5744, 128.310139, 1053.4, 1032, 'highest operating lift endpoint', null, '7d7a7ee4cca6398f7fae6da63f12d80697008482'),
      p('mid', 37.578544, 128.312897, 855.4, 853, 'interpolated operating downhill segment at midpoint elevation', '챔피언(중급), Kiwi', '1abd9ea65b960e4407c800345bef7e9b23786b78'),
      p('base', 37.581972, 128.325645, 657.3, 658, 'lowest operating lift endpoint', '펭귄리프트', '8700edd4382f2cfe9694cf41cd0f69750c4ceff6')
    ]
  },
  {
    id: 'region_cdqt3r41', label: '지산리조트', country: 'KR', timezone: 'Asia/Seoul',
    terrain_source: 'supabase://ski-data/region_cdqt3r41.geojson',
    points: [
      p('summit', 37.211552, 127.339724, 325.1, 317, 'highest operating lift endpoint', null, '84755c58e203dcd21964c564202950cbb1dbc524'),
      p('mid', 37.216596, 127.339556, 224, 241, 'interpolated operating downhill segment at midpoint elevation', null, '2c622f41079a9f791d6f4a23de1bde4e8ceb5cd7'),
      p('base', 37.217109, 127.344071, 122.9, 131, 'lowest operating lift endpoint', null, '84755c58e203dcd21964c564202950cbb1dbc524')
    ]
  },
  {
    id: 'region_huyvh4ar', label: '하이원스키장', country: 'KR', timezone: 'Asia/Seoul',
    terrain_source: 'supabase://ski-data/region_huyvh4ar.geojson',
    points: [
      p('summit', 37.179003, 128.830034, 1376.4, 1373, 'highest operating lift endpoint', '빅토리아, Victoria', '88eefb84d0c01efd76444f9c07f3f8da40372d38'),
      p('mid', 37.202555, 128.824533, 1045.9, 1069, 'interpolated operating downhill segment at midpoint elevation', '아테나2, Athena2', '055ee9a828dcd64e874633a415aca81f6e2d2821'),
      p('base', 37.204056, 128.838979, 715.4, 728, 'lowest operating lift endpoint', '제우스, Zeus', 'a1761d6fe9901198148ecb75156fbc2766f7f6b0')
    ]
  },
  {
    id: 'region_wxkfnu11', label: '곤지암리조트', country: 'KR', timezone: 'Asia/Seoul',
    terrain_source: 'supabase://ski-data/region_wxkfnu11.geojson',
    points: [
      p('summit', 37.328789, 127.282064, 495.8, 488, 'highest operating lift endpoint', null, 'a937c582c8324aaf48d003e8c6d9983607c245de'),
      p('mid', 37.332294, 127.288578, 336.4, 329, 'interpolated operating downhill segment at midpoint elevation', 'Gwamegi, 과메기', '0ef663ae27b29756892a4dff1a2316a933689da9'),
      p('base', 37.338227, 127.29235, 177, 182, 'lowest operating lift endpoint', null, '78444ccf85d93057553d7dd4b1acaafb6524731f')
    ]
  },
  {
    id: 'region_tsbh66ti', label: '쿠로다케로프웨이', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'supabase://ski-data/region_tsbh66ti.geojson',
    points: [
      p('summit', 43.703452, 142.927522, 1522.9, 1507, 'highest operating lift endpoint', '黒岳ペアリフト, Kurodake Pair Lift', 'a277c42253a9c5954cdb9500311fc3be08918497'),
      p('mid', 43.714578, 142.942056, 1093.2, 1070, 'interpolated operating lift segment at midpoint elevation', '大雪山層雲峡黒岳ロープウェイ, Daisetsuzan Sounkyo Kurodake Ropeway', '1117d0ea92df0926e3f3e025694c416c9b4f2026'),
      p('base', 43.724049, 142.946966, 663.5, 665, 'lowest operating lift endpoint', '大雪山層雲峡黒岳ロープウェイ, Daisetsuzan Sounkyo Kurodake Ropeway', '1117d0ea92df0926e3f3e025694c416c9b4f2026')
    ]
  },
  {
    id: 'region_q49t34uk', label: '아사리가와스키장', country: 'JP', timezone: 'Asia/Tokyo',
    terrain_source: 'supabase://ski-data/region_q49t34uk.geojson',
    points: [
      p('summit', 43.131201, 141.015567, 623.4, 616, 'highest operating lift endpoint', 'パープルリフト, Purple Lift', 'c1b275f1f6698b5bf46ed352055418598305079d'),
      p('mid', 43.136843, 141.026814, 388, 392, 'interpolated operating downhill segment at midpoint elevation', 'Green B', '4c0ef498da789db7c7c343e54892d80beb03b910'),
      p('base', 43.144194, 141.036398, 152.7, 168, 'lowest operating lift endpoint', 'イエローリフト, Yellow Lift', 'f45e2920e8e2973d5ea6065e912096da43976aa8')
    ]
  }
];

export const weatherRegionById = Object.fromEntries(weatherRegions.map(region => [region.id, region]));
export const weatherRegionIds = weatherRegions.map(region => region.id);
export const weatherRegionCounts = Object.freeze({
  JP: weatherRegions.filter(region => region.country === 'JP').length,
  KR: weatherRegions.filter(region => region.country === 'KR').length
});

