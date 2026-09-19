import type { GraphEdge,GraphNode } from './schema';
export function forceLayout(nodes:GraphNode[],edges:GraphEdge[],flat:boolean){
 const positions=new Map<string,[number,number,number]>();
 for(const [i,n] of nodes.entries()){const a=i*2.399963;const r=2+Math.sqrt(i)*1.5;positions.set(n.id,[Math.cos(a)*r,Math.sin(a)*r,flat?0:Math.sin(i*1.73)*r*.7]);}
 for(let step=0;step<60;step++){
  const f=new Map(nodes.map(n=>[n.id,[0,0,0]]));
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=positions.get(nodes[i].id)!,b=positions.get(nodes[j].id)!;const delta=a.map((v,k)=>v-b[k]);const d2=Math.max(.2,delta.reduce((s,v)=>s+v*v,0));const scale=Math.min(.2,1.5/d2);for(let k=0;k<3;k++){f.get(nodes[i].id)![k]+=delta[k]*scale;f.get(nodes[j].id)![k]-=delta[k]*scale;}}
  for(const e of edges){const a=positions.get(e.source_node_id),b=positions.get(e.target_node_id);if(!a||!b)continue;for(let k=0;k<3;k++){const pull=(b[k]-a[k])*.025*(.5+e.strength);f.get(e.source_node_id)![k]+=pull;f.get(e.target_node_id)![k]-=pull;}}
  for(const n of nodes){const p=positions.get(n.id)!,v=f.get(n.id)!;for(let k=0;k<3;k++)p[k]+=Math.max(-.5,Math.min(.5,v[k]-p[k]*.008));if(flat)p[2]=0;}
 }
 return positions;
}
