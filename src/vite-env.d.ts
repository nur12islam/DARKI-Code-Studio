type StudioTreeEntry = {name:string;path:string;type:'file'|'directory'};
type StudioChatRequest = {root:string;requestId:string;model:string;messages:Array<{role:'system'|'user'|'assistant';content:string}>;temperature?:number;autoFallback?:boolean;fallbackModels?:string[];provider?:'openrouter'|'gemini'};
declare global {
 interface Window {
  studio:{
   openFolder():Promise<string|null>;
   createProject(parent:string,name:string):Promise<string>;
   listFiles(root:string):Promise<StudioTreeEntry[]>;
   readFile(root:string,path:string):Promise<string>;
   writeFile(root:string,path:string,content:string):Promise<void>;
   createItem(root:string,path:string,type:'file'|'directory'):Promise<void>;
   deleteItem(root:string,path:string):Promise<void>;
   renameItem(root:string,from:string,to:string):Promise<void>;
   models(provider?:'openrouter'|'gemini'):Promise<Array<{id:string;name:string;context_length?:number;isFree?:boolean}>>;
   chat(request:StudioChatRequest):Promise<string>;
   onChatChunk(callback:(payload:{requestId:string;chunk:string})=>void):()=>void;
   githubAction(action:string,args:Record<string,string>):Promise<string>;
   undoLast(root:string):Promise<string>;
   gitStatus(root:string):Promise<{branch:string;status:string}>;
   push(root:string):Promise<string>;
   previewUrl(root:string):Promise<string|null>;
   saveSetting(key:string,value:string):Promise<void>;
   readSetting(key:string):Promise<string|null>;
   runCommand(root:string,command:string):Promise<{code:number|null;output:string}>;
   respondApproval(id:string,approved:boolean):Promise<boolean>;
   onApproval(callback:(request:{id:string;title:string;detail:string;kind:string;diff?:string})=>void):()=>void;
  }
 }
}
export {};
