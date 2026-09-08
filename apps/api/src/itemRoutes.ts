import type { Hono } from 'hono';
import type postgres from 'postgres';

type Sql=ReturnType<typeof postgres>;
type RequirePlayerId=(authorization?:string)=>Promise<string>;
const n=(v:unknown)=>Number(v??0);
async function receipt(tx:any,p:string,op:string,key?:string){if(!key||key.length>120)throw new Error('IDEMPOTENCY_KEY_REQUIRED');const rows=await tx`insert into game.action_receipts(player_id,operation,idempotency_key) values(${p},${op},${key}) on conflict(player_id,operation,idempotency_key) do nothing returning id`;if(rows[0])return{id:rows[0].id,duplicate:false,response:null};const [old]=await tx`select response from game.action_receipts where player_id=${p} and operation=${op} and idempotency_key=${key}`;return{id:null,duplicate:true,response:old?.response??{}};}

export function registerItemRoutes(app:Hono,sql:Sql,requirePlayerId:RequirePlayerId){
  app.get('/v1/inventory/advanced',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const items=await sql`
      select i.id,i.quantity,i.enhancement_level,i.sockets,i.bound,i.favorite,i.locked,i.acquired_at,
             d.id definition_id,d.name_es,d.name_en,d.item_type,d.rarity,d.min_level,d.stats,d.set_id,d.tradable,
             e.slot equipped_slot,
             exists(select 1 from game.market_listings ml where ml.inventory_item_id=i.id and ml.status='active') market_listed
      from game.inventory_items i
      join game.characters ch on ch.id=i.character_id
      join game.item_definitions d on d.id=i.item_definition_id
      left join game.equipment e on e.inventory_item_id=i.id
      where ch.player_id=${p}
      order by i.favorite desc,e.slot nulls last,i.acquired_at desc
      limit 300
    `;
    return c.json({items});
  });

  app.post('/v1/inventory/:itemId/favorite',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const itemId=c.req.param('itemId');const body=await c.req.json().catch(()=>({}));
    const out=await sql.begin(async tx=>{const r=await receipt(tx,p,'inventory.favorite',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};const [row]=await tx`select i.id,i.favorite from game.inventory_items i join game.characters ch on ch.id=i.character_id where i.id=${itemId} and ch.player_id=${p} for update`;if(!row)throw new Error('ITEM_NOT_FOUND');const favorite=body.favorite===undefined?!row.favorite:Boolean(body.favorite);await tx`update game.inventory_items set favorite=${favorite} where id=${itemId}`;const response={itemId,favorite};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response}}).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},404);return c.json(out);
  });

  app.post('/v1/inventory/:itemId/lock',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const itemId=c.req.param('itemId');const body=await c.req.json().catch(()=>({}));
    const out=await sql.begin(async tx=>{const r=await receipt(tx,p,'inventory.lock',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};const [row]=await tx`select i.id,i.locked from game.inventory_items i join game.characters ch on ch.id=i.character_id where i.id=${itemId} and ch.player_id=${p} for update`;if(!row)throw new Error('ITEM_NOT_FOUND');const locked=body.locked===undefined?!row.locked:Boolean(body.locked);await tx`update game.inventory_items set locked=${locked} where id=${itemId}`;const response={itemId,locked};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response}}).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},404);return c.json(out);
  });

  app.post('/v1/inventory/:itemId/enhance',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const itemId=c.req.param('itemId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'inventory.enhance',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};
      const [item]=await tx`select i.*,d.item_type,d.min_level,ch.player_id from game.inventory_items i join game.characters ch on ch.id=i.character_id join game.item_definitions d on d.id=i.item_definition_id where i.id=${itemId} and ch.player_id=${p} for update`;if(!item)throw new Error('ITEM_NOT_FOUND');if(!['weapon','armor','helmet','boots','ring','necklace','cape','artifact'].includes(String(item.item_type)))throw new Error('ITEM_NOT_ENHANCEABLE');if(n(item.enhancement_level)>=15)throw new Error('ITEM_MAX_ENHANCEMENT');
      const next=n(item.enhancement_level)+1;const goldCost=Math.round(70*Math.pow(next,2));const oreCost=1+Math.floor(next/3);
      const [gold]=await tx`select amount from game.resources where character_id=${item.character_id} and resource_code='gold' for update`;const [ore]=await tx`select amount from game.resources where character_id=${item.character_id} and resource_code='ore' for update`;if(n(gold?.amount)<goldCost)throw new Error('INSUFFICIENT_GOLD');if(n(ore?.amount)<oreCost)throw new Error('INSUFFICIENT_MATERIALS');
      await tx`update game.resources set amount=amount-${goldCost},updated_at=now() where character_id=${item.character_id} and resource_code='gold'`;await tx`update game.resources set amount=amount-${oreCost},updated_at=now() where character_id=${item.character_id} and resource_code='ore'`;await tx`update game.inventory_items set enhancement_level=${next} where id=${itemId}`;await tx`insert into game.item_upgrade_log(character_id,inventory_item_id,from_level,to_level,gold_spent,material_code,material_spent) values(${item.character_id},${itemId},${item.enhancement_level},${next},${goldCost},'ore',${oreCost})`;if(await tx`select 1 from game.equipment where inventory_item_id=${itemId}`)await tx`select game.recompute_character_power(${item.character_id})`;
      const response={itemId,enhancementLevel:next,goldCost,oreCost};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });
}
