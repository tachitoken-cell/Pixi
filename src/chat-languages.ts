export const CHAT_LANGUAGES = [
 {code:'en',label:'English'}, {code:'sv',label:'Svenska'}, {code:'da',label:'Dansk'},
 {code:'nl',label:'Nederlands'}, {code:'fi',label:'Suomi'}, {code:'fr',label:'Français'},
 {code:'de',label:'Deutsch'}, {code:'it',label:'Italiano'}, {code:'no',label:'Norsk'},
 {code:'pl',label:'Polski'}, {code:'pt',label:'Português'}, {code:'es',label:'Español'},
 {code:'uk',label:'Українська'}, {code:'ru',label:'Русский'}, {code:'tr',label:'Türkçe'},
 {code:'ar',label:'العربية'}, {code:'hi',label:'हिन्दी'}, {code:'id',label:'Bahasa Indonesia'},
 {code:'ja',label:'日本語'}, {code:'ko',label:'한국어'}, {code:'th',label:'ไทย'},
 {code:'vi',label:'Tiếng Việt'}, {code:'zh-CN',label:'中文（简体）'}, {code:'zh-TW',label:'中文（繁體）'},
] as const;
export function chatLanguageValid(value:unknown):value is typeof CHAT_LANGUAGES[number]['code'] {
 return CHAT_LANGUAGES.some(language=>language.code===value);
}
