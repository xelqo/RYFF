import { useEffect, useRef } from "react";
import type * as Tone from "tone";
interface Props {
  getAgent: () => Uint8Array | null; getMic: () => number; analyser: Tone.Analyser;
  countIn: number | null; recording: boolean; listening: boolean; expanded: boolean;
}
// Analysis only. This component never connects an audio source to speakers.
const fragment = `precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float energy;
uniform float expanded;
void main() {
 vec2 uv=gl_FragCoord.xy/resolution;
 vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.);
 float t=time*.22;
 for(int i=1;i<6;i++) {float n=float(i);p+=.12/n*vec2(sin(p.y*n*5.+t),cos(p.x*n*4.-t));}
 float field=sin(p.x*5.+t+sin(p.y*6.-t));
 float ribbon=pow(.5+.5*sin(field*3.+p.y*8.),5.);
 vec3 color=mix(vec3(.20,.48,.96),vec3(.53,.28,.86),smoothstep(.05,.55,uv.x));
 color=mix(color,vec3(.96,.42,.69),smoothstep(.40,.85,uv.x));
 color=mix(color,vec3(1.,.70,.55),smoothstep(.70,1.,uv.x+uv.y*.12));
 vec3 dark=color*(.16+ribbon*(.38+energy*.55))+vec3(.015,.018,.04);
 vec3 pastel=mix(vec3(.64,.79,1.),vec3(.81,.66,.96),smoothstep(.0,.50,uv.x));
 pastel=mix(pastel,vec3(1.,.74,.82),smoothstep(.45,.85,uv.x));
 pastel=mix(pastel,vec3(1.,.83,.72),smoothstep(.8,1.,uv.x));
 pastel-=ribbon*.10;
 gl_FragColor=vec4(mix(1.-pastel,dark,smoothstep(.46,.56,uv.y)*(1.-expanded)),1.);
}`;
export default function Visualizer(props: Props) {
 const canvasRef=useRef<HTMLCanvasElement>(null), waveRef=useRef<SVGPathElement>(null), meterRef=useRef<HTMLDivElement>(null);
 const current=useRef(props); current.current=props;
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  const gl=canvas.getContext("webgl",{alpha:false,antialias:false});
  const shaders:WebGLShader[]=[];let program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null;
  if(gl){
   const compile=(type:number,source:string)=>{const s=gl.createShader(type)!;shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);return s;};
   program=gl.createProgram();
   if(program){
    gl.attachShader(program,compile(gl.VERTEX_SHADER,"attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}"));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);program=null;}
   }
   if(program){gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,"position");gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   }
  }
  const uniforms=gl&&program?{resolution:gl.getUniformLocation(program,"resolution"),time:gl.getUniformLocation(program,"time"),energy:gl.getUniformLocation(program,"energy"),expanded:gl.getUniformLocation(program,"expanded")}:null;
  let raf=0,level=0,last=0,expansion=0;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);if(document.hidden||now-last<30)return;last=now;
   const p=current.current,mic=p.getMic(),agent=p.getAgent();let voice=0,music=0;
   if(agent?.length){for(const n of agent)voice+=n;voice/=agent.length*255;}
   const fft=p.analyser.getValue() as Float32Array;
   for(const n of fft)music+=Math.max(0,Math.min(1,(n+85)/65));music/=Math.max(1,fft.length);
   const target=Math.min(1,Math.max(mic,voice*1.5,music));level+=(target-level)*(target>level?.65:.12);
   if(meterRef.current){meterRef.current.style.setProperty("--level",String(Math.max(.02,mic)));meterRef.current.dataset.signal=mic>.03?"true":"false";}
   const time=reduced.matches?0:now*.001;
   if(gl&&uniforms&&!gl.isContextLost()){
    const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    expansion+=(Number(p.expanded)-expansion)*.05;gl.uniform1f(uniforms.expanded,expansion);gl.uniform2f(uniforms.resolution,w,h);gl.uniform1f(uniforms.time,time);gl.uniform1f(uniforms.energy,level);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   }
   let path="";
   for(let x=0;x<=1000;x+=10){const y=55+(reduced.matches?12:18+level*65)*Math.sin(x*.009+time*.8)+9*Math.sin(x*.018-time*.5);path+=`${x?"L":"M"}${x},${y} `;}
   waveRef.current?.setAttribute("d",path+"L1000,1200 L0,1200 Z");
  };
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);if(gl){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));}};
 },[]);
 return <>
  <div className="viz-wrap" aria-hidden="true"><canvas ref={canvasRef} className="viz" /></div>
  <svg className={`inversion-wave ${props.expanded?"expanded":""}`} viewBox="0 0 1000 1200" preserveAspectRatio="none" aria-hidden="true"><path ref={waveRef} fill="white" d="M0,55 L1000,55 L1000,1200 L0,1200 Z" /></svg>
  <div ref={meterRef} className={`input-meter ${props.listening||props.recording?"enabled":""}`} aria-label="Live microphone input level"><span className="meter-track"><span /></span><span>MIC INPUT</span></div>
  {props.countIn!==null&&<div className="count-in" role="status">{props.countIn>0?props.countIn:"GO"}</div>}
 </>;
}
