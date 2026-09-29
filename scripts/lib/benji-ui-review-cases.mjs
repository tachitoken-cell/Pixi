// One explicit coverage list shared by fixture generation, capture and contact sheets.
export const BENJI_UI_VIEWS = ['hud','mobile-menu','login','loading','gear','inventory','spells','professions','talents','training','shop','npc-talk','journal','contracts','story','crafting','raid','raid-collection','instant-combat','arena','dungeon','pets','mounts','referrals','options','wallet','bank','auction','store','friends','achievements','nfts'];
export const BENJI_UI_VIEWPORTS = [['desktop',1440,900],['mobile',390,844],['landscape',844,390],['narrow',320,740]];
export const benjiViewsForViewport = mode => mode === 'narrow' ? ['login','hud','mobile-menu'] : BENJI_UI_VIEWS;
export const BENJI_UI_CAPTURE_COUNT = BENJI_UI_VIEWPORTS.reduce((count,[mode])=>count+benjiViewsForViewport(mode).length,0);
