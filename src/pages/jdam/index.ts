/** Hornet JDAM TOO: cockpit workflow and explicitly scripted delivery, not weapon engineering. */
import type { PageFactory } from '../../app/page';
import { h, button, row, group, labLayout, screenBezel, cleanup, bindKeys, setText } from '../../ui';
import { readTheme } from '../../ui/theme';
import { createUfc } from '../harm/ufc';
import { PodView } from '../atflir/display';
import { AtflirSession } from '../atflir/model';
import { bindKeyboardHold } from '../atflir/hold';
import { JdamSession } from './model';
import { JDAM_CAVEATS, JDAM_SOURCE } from '../../data/fa18cJdam';
import { JDAM_ORDER, JDAM_LESSONS, jdamKey, jdamLesson } from './lessons';
import '../atflir/style.css';
import '../harm/cockpit.css';
import './style.css';
const page: PageFactory = () => {
  const clean = cleanup();
  return { mount(ctx) {
    const id = jdamLesson(ctx.params.get('lesson')), lesson = JDAM_LESSONS[id], preview = ctx.params.has('shot');
    let session = new JdamSession(id), saved = false, waypoint: 'assigned'|'wrong' = 'assigned', follow = true;
    const sensor = new AtflirSession('track'); sensor.focused = true; sensor.fov = 2;
    const worldHost = h('div', { class: 'atflir-pod-host' }), podHost = h('div', { class: 'atflir-ddi-pod' });
    let world: PodView | null = null, pod: PodView | null = null;
    const act = (fn:()=>void) => { fn(); update(); };
    const select = button({ label:'J-82',lamp:true,onClick:()=>act(()=>session.selectWeapon(!session.selected)) });
    const mode = button({ label:'MODE TOO',onClick:()=>act(()=> {session.mode=session.mode==='TOO'?'PP':'TOO';}) });
    const fuze = button({ label:'EFUZ OFF',onClick:()=>act(()=> {session.efuz=session.efuz==='OFF'?'INST':'OFF';}) });
    const master = button({label:'MASTER ARM SAFE',lamp:true,onClick:()=>act(()=>{session.masterArm=!session.masterArm;})});
    const ag = button({label:'A/G',lamp:true,onClick:()=>act(()=>{session.ag=!session.ag;})});
    const skip = button({label:'Skip warmup · training aid',onClick:()=>act(()=>session.skipWarmup())});
    const start = button({label:'Start aligned training pass',onClick:()=>act(()=>session.startRun())});
    const release = button({label:'Hold Weapon Release',keys:'R',onClick:e=>{if(e.detail===0)act(()=>{session.setRelease(true);session.step(.001);session.setRelease(false);});}});
    clean.on<PointerEvent>(release.el,'pointerdown',e=>{if(e.button!==0)return;release.el.setPointerCapture(e.pointerId);session.setRelease(true);});
    for(const ev of ['pointerup','pointercancel','lostpointercapture']) clean.on(release.el,ev,()=>session.setRelease(false));
    bindKeyboardHold(release.el,value=>session.setRelease(value),clean);
    clean.on(window,'blur',()=>session.setRelease(false));
    clean.on(document,'visibilitychange',()=>{if(document.hidden)session.setRelease(false);});
    const camera = button({label:'Camera: follow bomb',size:'s',onClick:()=>act(()=>{follow=!follow;})});
    const wpText=h('span',{class:'ui-placard'});
    const designation = button({label:'WPDSG',onClick:()=>act(()=>{session.designation=waypoint;})});
    const message=h('p',{class:'atflir-feedback',role:'status','aria-live':'polite'});
    const status=h('p',{class:'atflir-state'}), result=h('p',{class:'atflir-result'});
    const steps=lesson.steps.map(t=>h('li',null,t));
    const next=JDAM_ORDER[JDAM_ORDER.indexOf(id)+1];
    const nextButton=button({label:next?'Next lesson':'View progress',onClick:()=>ctx.navigate(next?`jdam?lesson=${next}`:'progress')});
    const hud=h('canvas',{width:400,height:400,'aria-label':'JDAM HUD: manual release and range status'});
    const storesText=h('div',{class:'atflir-stores-readout'});
    const stores=h('div',{class:'atflir-stores ui-fill'},row(select.el,mode.el),storesText,row(fuze.el,h('span',null,'QTY 1 · MAN')));
    const podContent=h('div',{class:'atflir-flir ui-fill'},podHost,h('div',{class:'atflir-ddi-bottom'},h('span',null,'FLIR · WPDSG')));
    const ufc=createUfc({id:'jdam-ufc',onKey:()=>{}}); clean.add(()=>ufc.dispose());
    ufc.draw({scratch:'TOO',options:[],hint:null});
    for(const b of ufc.el.querySelectorAll('button')) b.disabled=true;
    const strip=[screenBezel({label:'HUD · MANUAL',content:hud,aspect:'1'}).el,
      screenBezel({label:'LEFT DDI · STORES',content:stores,aspect:'1'}).el,
      screenBezel({label:'RIGHT DDI · FLIR',content:podContent,aspect:'1'}).el,
      h('div',{class:'ui-strip-block atflir-ufc-block'},h('div',{class:'ui-placard'},'UFC'),ufc.el,h('p',{class:'atflir-ufc-hint'},'TOO uses the current designation. No UFC coordinate entry in this lesson. PP programming is not included.'))];
    const controls=h('div',{class:'atflir-controls'},
      h('nav',{class:'atflir-lessons','aria-label':'JDAM lessons'},JDAM_ORDER.map((key,i)=>h('a',{href:`#/jdam?lesson=${key}`,'aria-current':key===id?'page':undefined},`${i+1}. ${JDAM_LESSONS[key].title}`))),
      h('section',{class:'atflir-brief'},h('div',{class:'ui-placard'},'GBU-38 · TOO'),h('h2',null,lesson.title),h('p',null,lesson.goal),h('ol',{class:'atflir-steps'},steps),result,nextButton.el),
      group({label:'Aircraft & weapon',children:[row(ag.el,master.el),skip.el],hint:'Select J-82, MODE TOO and EFUZ INST on the left DDI. Warmup is 2:30; skipping is a labelled training aid.'}),
      group({label:'HSI · target designation',children:[row(button({label:'WP2 · assigned truck',onClick:()=>act(()=>{waypoint='assigned';})}).el,button({label:'WP3 · other truck',onClick:()=>act(()=>{waypoint='wrong';})}).el),row(wpText,designation.el)],hint:'Selecting a waypoint does not designate it. Press WPDSG and inspect FLIR. These are fictional training waypoints.'}),
      id !== 'setup' ? group({label:'Training pass',children:[start.el,release.el,button({label:'Reload for another pass',onClick:()=>act(()=>session.retry())}).el],hint:'R is the browser substitute for Weapon Release; RAlt+Space is also supported. Flight and range gates are scripted.'}) : null,
      button({label:'Restart lesson',variant:'ghost',onClick:()=>{session=new JdamSession(id);waypoint='assigned';saved=false;update();}}).el,
      h('details',null,h('summary',null,'Sources & training limits'),h('p',null,JDAM_SOURCE),h('ul',null,JDAM_CAVEATS.map(t=>h('li',null,t)))));
    const viewport=h('div',{class:'atflir-view'},h('div',{class:'atflir-viewhead'},h('span',null,'3D TRAINING RANGE'),camera.el),worldHost,status,message);
    const layout=labLayout({id:'jdam',class:'atflir jdam',header:{title:'JDAM',meta:'F/A-18C · GBU-38 TOO',lede:'Prepare J-82, designate the target, release on IN RNG. Follow the bomb to impact.'},viewport,console:controls,strip});
    ctx.root.append(layout.el); clean.add(()=>layout.destroy());
    try { world=new PodView(sensor,'gbu38');worldHost.append(world.el);clean.add(()=>world?.dispose());pod=new PodView(sensor,'gbu38');podHost.append(pod.el);clean.add(()=>pod?.dispose()); }
    catch(error){worldHost.append(h('p',{role:'alert'},'WebGL unavailable. Enable graphics acceleration for the 3D delivery.'));console.error(error);}
    const theme=readTheme();
    if(preview){session.selectWeapon(true);session.skipWarmup();session.ag=true;session.masterArm=true;session.mode='TOO';session.efuz='INST';session.designation=ctx.params.get('shot')==='miss'?'wrong':'assigned';session.step(.01);
      if(['flight','hit','miss'].includes(ctx.params.get('shot')??'')){session.startRun();session.setRelease(true);session.step(8);session.step(ctx.params.get('shot')==='flight'?5:12);session.setRelease(false);}}
    function update(continuous=false){
      if(session.complete&&!saved&&!preview){ctx.app.setProgress(jdamKey(id),true);saved=true;}
      const target=session.designation;
      sensor.x=target==='wrong'?-140:140;sensor.y=target==='wrong'?30:-70;sensor.mode=target?'AUTO':'INR';sensor.tracked=target;sensor.designation=target?{x:sensor.x,y:sensor.y}:null;
      if(!target){sensor.fov=0;sensor.x=0;sensor.y=0;}else sensor.fov=2;
      select.setLit(session.selected);mode.setLabel(`MODE ${session.mode}`);fuze.setLabel(`EFUZ ${session.efuz}`);ag.setLit(session.ag);master.setLit(session.masterArm);master.setLabel(`MASTER ARM ${session.masterArm?'ARM':'SAFE'}`);
      skip.setDisabled(!session.timing);start.setDisabled(session.phase==='flight'||session.phase==='approach');camera.setLabel(follow?'Camera: follow bomb':'Camera: range');
      const spent=['flight','hit','miss'].includes(session.phase);
      const station=spent?'—':session.status, rangeCue=spent?'RELEASED':session.inRange?'IN RNG':'OUT OF RANGE';
      setText(wpText,`Selected ${waypoint==='assigned'?'WP2':'WP3'}`);setText(message,session.message);
      setText(status,`${station} · ${rangeCue} · ${target?'TGT '+(target==='assigned'?'WP2':'WP3'):'NO TGT'} · NO LASER REQUIRED`);
      const clock=session.alignmentClock; const clockText=typeof clock==='number'?`${Math.floor(clock/60)}:${String(Math.floor(clock%60)).padStart(2,'0')}`:String(clock);
      setText(storesText,`J-82\n${station}${!spent&&session.timing?'\nTIMING '+clockText:''}\n${session.mode} · MAN\n${target?'TGT '+(target==='assigned'?'WP2':'WP3'):'NO TGT'}\n${rangeCue}\n${spent?'0':'1'} STORE`);
      steps.forEach((el,i)=>{el.dataset.done=String(session.done[i]);el.setAttribute('aria-label',`${session.done[i]?'Complete':'Pending'}: ${lesson.steps[i]}`);});
      setText(result,session.complete?(preview?'Preview — progress not saved.':'Lesson complete. Progress saved.'):'Complete all three checks.');nextButton.el.hidden=!session.complete;
      for(const view of [world,pod])view?.setStoreDelivery(session);world?.setFollowBomb(follow);world?.update(sensor,false,true,preview,continuous);pod?.update(sensor,true,false,preview,continuous);
      const c=hud.getContext('2d');if(c){c.fillStyle=theme.screen;c.fillRect(0,0,400,400);c.fillStyle=theme.sym;c.strokeStyle=theme.sym;c.lineWidth=2;c.font=`18px ${theme.fontMono}`;c.textAlign='center';
        c.fillText(session.ag?'A/G':'NAV',200,35);c.fillText('J-82 · MAN',200,65);c.beginPath();c.moveTo(100,145);c.lineTo(300,145);c.moveTo(200,133);c.lineTo(200,157);c.stroke();
        c.beginPath();c.arc(200,220,10,0,Math.PI*2);c.moveTo(170,220);c.lineTo(190,220);c.moveTo(210,220);c.lineTo(230,220);c.stroke();
        c.fillText(session.inRange?'IN RNG':session.phase==='approach'?`TMR ${Math.ceil(session.timer)}`:session.phase.toUpperCase(),200,300);c.font=`13px ${theme.fontMono}`;c.fillText('SCRIPTED RANGE · MANUAL RELEASE',200,375);}}
    let frame=0,prev=performance.now();const tick=(now:number)=>{const dt=document.hidden?0:Math.min(.1,(now-prev)/1000);prev=now;if(!preview)session.step(dt);update(true);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);clean.add(()=>cancelAnimationFrame(frame));
    const held={down:()=>session.setRelease(true),up:()=>session.setRelease(false)};
    clean.add(bindKeys({R:held,'RAlt+Space':held}));update();
  },unmount(){clean.dispose();}};
};
export default page;
