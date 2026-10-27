import type {TreeEntry,ChatRequest,ApprovalRequest} from '../electron/preload';
declare global {
 interface Window { studio:{
  openFolder():Promise<string|null>;listFiles(root:string):Promise<TreeEntry[]>;readFile(root:string,path:string):Promise<string>;writeFile(root:string,path:string,content:string):Promise<void>;createItem(root:string,path:string,type:'file'|'directory'):Promise<void>;deleteItem(root:string,path:string):Promise<void>;renameItem(root:string,from:string,to:string):Promise<void>;
  models():Promise<Array<{id:string;name:string;context_length?:number}>>;chat(request:ChatRequest):Promise<string>;onChatChunk(callback:(payload:{requestId:string;chunk:string})=>void):()=>void;githubAction(action:string,args:Record<string,string>):Promise<string>;undoLast(root:string):Promise<string>;gitStatus(root:string):Promise<{branch:string;status:string}>;push(root:string):Promise<string>;previewUrl(root:string):Promise<string|null>;
  saveSetting(key:string,value:string):Promise<void>;readSetting(key:string):Promise<string|null>;runCommand(root:string,command:string):Promise<{code:number|null;output:string}>;
  respondApproval(id:string,approved:boolean):Promise<boolean>;onApproval(callback:(request:ApprovalRequest)=>void):()=>void;
 }}
}
export {};