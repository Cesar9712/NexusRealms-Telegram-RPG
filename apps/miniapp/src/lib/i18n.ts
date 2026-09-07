export type Locale='es'|'en';

const es={continueAdventure:'CONTINUAR AVENTURA',currentRealm:'REINO ACTUAL',progression:'PROGRESIÓN',yourLegend:'Tu leyenda',bastion:'Bastión',clan:'Clan',inventory:'Inventario',quests:'Misiones',moreSystems:'Más sistemas',connectedRealms:'Reinos conectados',home:'Inicio',adventure:'Aventura',equipment:'Equipo',gold:'Oro',crystals:'Cristales',loading:'Sincronizando el reino…',telegramRequired:'Abre el juego desde Telegram para autenticar tu héroe.'};
const en={continueAdventure:'CONTINUE ADVENTURE',currentRealm:'CURRENT REALM',progression:'PROGRESSION',yourLegend:'Your legend',bastion:'Bastion',clan:'Clan',inventory:'Inventory',quests:'Quests',moreSystems:'More systems',connectedRealms:'Connected realms',home:'Home',adventure:'Adventure',equipment:'Gear',gold:'Gold',crystals:'Crystals',loading:'Synchronizing the realm…',telegramRequired:'Open the game from Telegram to authenticate your hero.'};
export const dictionaries={es,en} as const;
export type TranslationKey=keyof typeof es;
export function localeFrom(input?:string|null):Locale{return input?.toLowerCase().startsWith('en')?'en':'es';}
export function t(locale:Locale,key:TranslationKey){return dictionaries[locale][key];}
