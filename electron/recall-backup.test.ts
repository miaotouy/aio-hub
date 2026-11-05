import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RecallBackup } from "./recall-backup";
import { AssetManager, type BackupAssetAccess } from "./asset-manager";
import type { Asset } from "../src/types/asset-management";
let directory: string;
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => {resolve = done;}); return {promise,resolve}; };
const noAssets = { withBackupAssets: <T>(task: (assets: BackupAssetAccess) => Promise<T>) => task({ describe: async () => {throw Error("unexpected asset");}, existing: async () => null, restore: async () => {throw Error("unexpected asset");} }) };
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-recall-backup-")); });
afterEach(async () => { await fs.rm(directory,{recursive:true,force:true}); });

it("accepts cancellation before work starts, rejects other-window cancellation and drains before shutdown", async () => {
  const run = vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    if (command === "recall_list_bases") return ids.map((id) => ({id}));
    if (command === "_recall_backup_finish_batch") return args;
    throw Error(command);
  });
  const backup = new RecallBackup({run},noAssets,"test");
  const task = backup.run("recall_export_backups",{recallIds:[],targetDirectory:directory},7);
  expect(backup.hasPendingOperations).toBe(true);
  await expect(backup.run("recall_cancel_backup_operation",{},8)).rejects.toThrow("原窗口");
  await backup.run("recall_cancel_backup_operation",{},7);
  const shutdown = backup.shutdown();
  await expect(task).resolves.toMatchObject({cancelled:true,succeeded:[],failed:[]});
  await shutdown;expect(backup.hasPendingOperations).toBe(false);
  await expect(backup.run("recall_export_backups",{},7)).rejects.toThrow("shutting down");
  expect((await fs.readdir(directory)).filter((name) => name.startsWith(".aio-recall-export."))).toEqual([]);
});

it("finishes the current collection after cancellation and releases snapshots and temporary packages", async () => {
  const started=deferred(),hold=deferred();const events: unknown[]=[];
  const run=vi.fn(async(command:string,args:Record<string,unknown>={})=>{
    if(command==="_recall_backup_prepare_export")return {token:"snapshot",assetIds:[]};
    if(command==="_recall_backup_export"){started.resolve();await hold.promise;return {libraryId:ids[0],libraryName:"first",outputPath:"first.aio-recall",entryCount:0,assetCount:0,warnings:[]};}
    if(command==="_recall_backup_discard_export")return null;
    if(command==="_recall_backup_finish_batch")return args;
    throw Error(command);
  });
  const backup=new RecallBackup({run},noAssets,"test",(event,payload)=>events.push({event,payload}));
  const task=backup.run("recall_export_backups",{recallIds:ids,targetDirectory:directory},1);
  await started.promise;
  await expect(backup.run("recall_import_backup",{},1)).rejects.toThrow("正在运行");
  await backup.run("recall_cancel_backup_operation",{},1);hold.resolve();
  await expect(task).resolves.toMatchObject({cancelled:true,succeeded:[{libraryId:ids[0]}],failed:[]});
  expect(run.mock.calls.filter(([command])=>command==="_recall_backup_prepare_export")).toHaveLength(1);
  expect(run.mock.calls.some(([command])=>command==="_recall_backup_discard_export")).toBe(true);
  expect(events).toEqual([{event:"recall-backup-progress",payload:{operation:"export",current:0,total:2,failed:0,libraryId:ids[0]}},{event:"recall-backup-progress",payload:{operation:"export",current:1,total:2,failed:0,libraryId:ids[0]}}]);
  expect(await fs.readdir(directory)).toEqual([]);
});

it("keeps exporting after a collection fails and reports the original failure with successful packages", async()=>{
 const run=vi.fn(async(command:string,args:Record<string,unknown>={})=>{
  if(command==="_recall_backup_prepare_export"){if(args.recallId===ids[0])throw Error("collection unavailable");return {token:"snapshot",assetIds:[]};}
  if(command==="_recall_backup_export")return {libraryId:ids[1],libraryName:"second",outputPath:"second.aio-recall",entryCount:0,assetCount:0,warnings:[]};
  if(command==="_recall_backup_discard_export")return null;
  if(command==="_recall_backup_finish_batch")return args;
  throw Error(command);
 });
 const backup=new RecallBackup({run},noAssets,"test");
 await expect(backup.run("recall_export_backups",{recallIds:[...ids,ids[1]],targetDirectory:directory})).resolves.toMatchObject({cancelled:false,succeeded:[{libraryId:ids[1]}],failed:[{libraryId:ids[0],error:expect.stringContaining("collection unavailable")}]});
});

it("rolls back newly restored assets and reused origins when the collection commit fails",async()=>{
 const app=path.join(directory,"app");await fs.mkdir(app);
 const host={root:app,emit:vi.fn(),trashItem:vi.fn(),inspectMedia:async()=>({metadata:{}})};
 let assets=new AssetManager(host);
 const old=await assets.run("import_asset_from_bytes",{originalName:"existing.txt",bytes:Buffer.from("existing"),options:{sourceModule:"original"}}) as Asset;
 const existing=path.join(directory,"existing.txt"),fresh=path.join(directory,"raw.doc");await fs.writeFile(existing,"existing");const raw=Buffer.from([0xd0,0xcf,0x11,0xe0,1,2,3,4]);await fs.writeFile(fresh,raw);
 const staged=[{originalAssetId:"old",name:"existing.txt",mimeType:"text/plain",path:existing},{originalAssetId:"fresh",name:"raw.doc",mimeType:"application/msword",path:fresh}];
 let restoredMap:Record<string,{id:string}>|undefined;
 const run=vi.fn(async(command:string,args:Record<string,unknown>={})=>{
  if(command==="_recall_backup_prepare_import")return {token:"prepared",assets:staged,legacyAssetIds:[]};
  if(command==="_recall_backup_commit_import"){restoredMap=args.assetMap as typeof restoredMap;expect(restoredMap!.old.id).toBe(old.id);const asset=await fs.readFile(path.join(app,"assets",(host.emit.mock.calls.find(([event,asset])=>event==="asset-imported"&&(asset as Asset).id===restoredMap!.fresh.id)![1] as Asset).path));expect(asset).toEqual(raw);throw Error("collection commit failed");}
  if(command==="_recall_backup_discard_import")return null;
  throw Error(command);
 });
 await expect(new RecallBackup({run},assets,"test").run("recall_import_backup",{sourcePath:"sample.aio-recall",options:{conflictStrategy:"replace"}})).rejects.toThrow("collection commit failed");
 assets=new AssetManager(host);const remaining=await assets.run("list_all_assets") as Asset[];
 expect(remaining.map((asset)=>asset.id)).toEqual([old.id]);expect(remaining[0].origins.map((item)=>item.sourceModule)).toEqual(["original"]);expect(await fs.readFile(fresh)).toEqual(raw);expect(host.trashItem).not.toHaveBeenCalled();
 expect(run.mock.calls.some(([command])=>command==="_recall_backup_discard_import")).toBe(true);
});
