interface Settings { defaultQuality: string; downloadDirectory: string; useCookies: boolean; browser: string }
interface Item { id:string; url:string; title:string; domain:string; duration?:string; thumbnail?:string; status:"ready"|"downloading"|"done"|"error"; progress:number; format:string; error?:string; createdAt:number }
interface State { url:string; items:Item[]; message:string|null; lastUpdate:number|null }

const { ui } = AdanotchKit;
const KEY = "video_downloader_state";
const defaults: State = { url:"", items:[], message:null, lastUpdate:null };

function state(ctx: Adanotch.Context<Settings>): State { return {...defaults, ...(ctx.storage.get<State>(KEY) || {}), items:(ctx.storage.get<State>(KEY)?.items || [])}; }
function save(ctx: Adanotch.Context<Settings>, s:State) { ctx.storage.set(KEY, s); }
function validUrl(value:string) { try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } }
function domain(value:string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "unknown source"; } }
function quality(format:string, settings:Settings) { if (format === "audio") return "bestaudio/best"; if (format === "1080") return "bestvideo[height<=1080]+bestaudio/best[height<=1080]"; if (format === "720") return "bestvideo[height<=720]+bestaudio/best[height<=720]"; return "bestvideo+bestaudio/best"; }
function command(item:Item, settings:Settings) { const output = settings.downloadDirectory.replace(/\\/g, "\\\\").replace(/"/g, '\\"'); const cookie = settings.useCookies ? ` --cookies-from-browser ${settings.browser.toLowerCase()}` : ""; const audio = item.format === "audio" ? " --extract-audio --audio-format mp3" : ""; return `yt-dlp${cookie} -f "${quality(item.format, settings)}"${audio} -o "${output}/%(title)s.%(ext)s" "${item.url}"`; }

function compact(s:State) { const active = s.items.find(i => i.status === "downloading"); return {leading:ui.icon(active ? "arrow.down.circle.fill" : "arrow.down.circle", {tone:active ? "accent":"default"}), trailing:ui.badge(active ? `${active.progress}%` : `${s.items.filter(i=>i.status==="ready").length} queued`, {tone:active ? "accent":"default"})}; }
function expanded(ctx:Adanotch.Context<Settings>, s:State):Adanotch.Node {
  const active = s.items.find(i=>i.status === "downloading");
  return ui.stack([
    ui.stack([ui.icon("film.stack",{tone:"accent"}), ui.stack([ui.text("Video Downloader",{style:"title"}),ui.text("yt-dlp queue · privacy-first",{style:"caption",tone:"secondary"})],{spacing:2}),ui.spacer(),ui.button("","paste",{icon:"doc.on.clipboard"})],{axis:"h",spacing:8,align:"center"}),
    s.message ? ui.stack([ui.icon("info.circle",{tone:"accent"}),ui.text(s.message,{style:"caption",tone:"secondary"})],{axis:"h",spacing:6}) : null,
    ui.textField("setUrl",{value:s.url,placeholder:"Paste a YouTube, Vimeo, Twitch or direct video URL…"}),
    ui.stack([ui.picker("setFormat", active?.format || ctx.settings.defaultQuality,["best","1080","720","audio"],{label:"Quality / format"}),ui.button("Inspect URL","inspect",{primary:true,icon:"magnifyingglass"})],{axis:"h",spacing:8,align:"center"}),
    active ? ui.stack([ui.text(`Downloading · ${active.title}`,{style:"caption"}),ui.progress(active.progress,{tone:"accent"})],{spacing:5}) : null,
    ui.divider(),
    s.items.length ? ui.scroll(ui.list(s.items.slice(0,12).map(i=>({title:i.title,subtitle:`${i.domain} · ${i.format} · ${i.status === "done" ? "Complete" : i.status === "error" ? i.error || "Failed" : i.status === "ready" ? "Ready to download" : `${i.progress}%`}`,icon:i.status === "done" ? "checkmark.circle.fill" : i.status === "error" ? "xmark.octagon" : "film",trailing:i.status === "ready" ? "Download" : i.status === "done" ? "Done" : `${i.progress}%`,buttons:i.status === "ready" ? [{icon:"arrow.down.circle",label:"Copy command",action:"download",value:i.id}] : i.status === "error" ? [{icon:"arrow.clockwise",label:"Retry",action:"download",value:i.id}] : []}))),{maxHeight:230}) : ui.stack([ui.icon("tray",{tone:"secondary"}),ui.text("Your download queue is empty",{tone:"secondary"}),ui.text("Paste a link to get started.",{style:"caption",tone:"secondary"})],{align:"center",spacing:5}),
    ui.stack([ui.button("Clear completed","clearCompleted",{icon:"trash"}),ui.spacer(),ui.button("Copy setup","copySetup",{icon:"terminal"})],{axis:"h",spacing:8})
  ],{spacing:10});
}

AdanotchKit.activity<Settings>({
  setup(ctx) { ctx.storage.get<State>(KEY) || save(ctx, defaults); AdanotchKit.events.on("command", (payload:any) => { if(payload.name !== "download.progress" && payload.name !== "download.done") return; const s=state(ctx); const p=payload.data || {}; const item=s.items.find(i=>i.id===p.id); if(!item)return; item.progress=Math.max(0,Math.min(100,Number(p.progress ?? (payload.name === "download.done" ? 100:item.progress)))); item.status=payload.name === "download.done" ? "done" : "downloading"; s.lastUpdate=Date.now(); save(ctx,s); ctx.refresh(); }); },
  async update(ctx) { const s=state(ctx); return {compact:compact(s),expanded:expanded(ctx,s)}; },
  async onAction(action,ctx,value) { const s=state(ctx); const text=String(value ?? "");
    if(action === "setUrl") { s.url=text.trim(); save(ctx,s); return; }
    if(action === "setFormat") { const item=s.items[0]; if(item) item.format=text; save(ctx,s); return; }
    if(action === "paste") { const v=await AdanotchKit.clipboard.readText(); if(v && validUrl(v)){s.url=v; s.message="URL pasted from clipboard";} else s.message="Clipboard does not contain a supported web URL"; save(ctx,s); return; }
    if(action === "inspect") { if(!validUrl(s.url)){s.message="Enter a valid http(s) video URL first";save(ctx,s);return;} const id=`video-${Date.now()}`; let title=domain(s.url); let thumbnail=""; try { const meta=await ctx.network.fetchJSON<any>(`https://noembed.com/embed?url=${encodeURIComponent(s.url)}`); title=String(meta.title || title); thumbnail=String(meta.thumbnail_url || ""); } catch {} const item:Item={id,url:s.url,title,domain:domain(s.url),thumbnail,status:"ready",progress:0,format:ctx.settings.defaultQuality,createdAt:Date.now()}; s.items=[item,...s.items].slice(0,20); s.message="Video inspected — copy the command to start the download"; save(ctx,s); return; }
    if(action === "download") { const item=s.items.find(i=>i.id===String(value)); if(!item)return; await AdanotchKit.clipboard.writeText(command(item,ctx.settings)); s.message=`Command copied for “${item.title}”. Run it in Terminal.`; save(ctx,s); AdanotchKit.notify.island({text:"yt-dlp command copied",icon:"checkmark.circle.fill",tone:"success",duration:3}); return; }
    if(action === "copySetup") { await AdanotchKit.clipboard.writeText("brew install yt-dlp ffmpeg"); s.message="Setup command copied: brew install yt-dlp ffmpeg"; save(ctx,s); return; }
    if(action === "clearCompleted") { s.items=s.items.filter(i=>i.status!=="done"); s.message="Completed downloads cleared"; save(ctx,s); }
  }
});
