import React, { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend, ReferenceLine, PieChart, Pie } from "recharts";
import { createClient } from '@supabase/supabase-js';

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  {name:"Aluguel",color:"#E8575A",desc:"Aluguel do apartamento, condomínio, IPTU"},
  {name:"Carro",color:"#F4A261",desc:"Estacionamento, combustível, seguro auto, manutenção, Conectcar, Zul, pedágio"},
  {name:"Saúde",color:"#E76F51",desc:"Farmácia, plano de saúde (CASSI), dentista, médicos, manipulação"},
  {name:"Casa",color:"#2A9D8F",desc:"Luz, gás (Comgás), seguro residencial, diarista (Rose), manutenção"},
  {name:"Supermercado",color:"#264653",desc:"Hortisabor, Pão de Açúcar, feirante, hortifruti, Rappi mercado"},
  {name:"Marmitas",color:"#8AB17D",desc:"LivUp, Jequitibazeiro, Pagali, marmita fitness"},
  {name:"Lazer",color:"#E9C46A",desc:"Restaurantes, bares, iFood, shows, ingressos, cinema, entretenimento"},
  {name:"Viagens",color:"#287271",desc:"Passagens aéreas, hotel, Airbnb, Booking, Smiles"},
  {name:"Tecnologia",color:"#6C63FF",desc:"Spotify, Netflix, Disney+, Apple, Amazon Prime, Google, Serasa"},
  {name:"Gastos Maria",color:"#C77DBA",desc:"Gastos pessoais da Maria: Soho House, LinkedIn, cabeleireiro"},
  {name:"Gastos Ryo",color:"#5B8DEF",desc:"Gastos pessoais do Ryo: Classpass, personal, Smiles Club, VGBL"},
  {name:"Casamento",color:"#F4845F",desc:"Fornecedores do casamento: decoração, buffet, convites, vestido, terno"},
  {name:"Reembolso",color:"#4CAF50",desc:"Reembolsos recebidos, devoluções, estornos — não conta como gasto"},
  {name:"Outros (Saídas)",color:"#999",desc:"Anuidade cartão, IOF, juros, taxas bancárias, seguros diversos"}
];
const PALETTE = ["#E8575A","#F4A261","#E76F51","#2A9D8F","#264653","#8AB17D","#E9C46A","#287271","#6C63FF","#C77DBA","#5B8DEF","#F4845F","#4CAF50","#999","#D4A5A5","#7EC8E3","#B5EAD7","#FFB7B2","#C3B1E1","#FFDAC1","#B5B682"];
const KEY_MAP = {"Aluguel":"aluguel","Carro":"carro","Saúde":"saude","Casa":"casa","Supermercado":"supermercado","Marmitas":"marmitas","Lazer":"lazer","Viagens":"viagens","Tecnologia":"tecnologia","Gastos Maria":"gastosMaria","Gastos Ryo":"gastosRyo","Casamento":"casamento","Reembolso":"reembolso","Outros (Saídas)":"outros"};
const REV_KEY_MAP = Object.fromEntries(Object.entries(KEY_MAP).map(([k,v])=>[v,k]));
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const EXPENSE_KEYS = ["aluguel","carro","saude","casa","supermercado","marmitas","lazer","viagens","tecnologia","gastosMaria","gastosRyo","casamento","outros"];
const BUDGET_INCOME_KEYS = ["receitaMaria","receitaRyo","hedge","outrasReceitas","impostos","investimento"];

// ─── STATIC RULES ────────────────────────────────────────────────────────────
const STATIC_RULES = [
  [/aluguel/i,"Aluguel"],[/\.706\.268/i,"Aluguel"],
  [/estacionament/i,"Carro"],[/conectc/i,"Carro"],[/\bzul\b/i,"Carro"],[/depark/i,"Carro"],
  [/valet/i,"Carro"],[/\bpark\b/i,"Carro"],[/gevapark/i,"Carro"],[/allpark/i,"Carro"],
  [/gasolina|combusti|shell|ipiranga|posto/i,"Carro"],[/seguro auto/i,"Carro"],
  [/farmac|drogaria|drogas|raia|droga\s?raia|panvel|ultrafarma|manipula/i,"Saúde"],
  [/cassi|odonto|medic|clinic|hospital|consult|lab\b|laborat/i,"Saúde"],
  [/enel|eletropaulo|comgas|comgás|cpfl|energisa|light\b/i,"Casa"],
  [/rose\s*diari|diarista/i,"Casa"],[/seguro resid/i,"Casa"],[/condo/i,"Aluguel"],
  [/hortisabor|pão de açúcar|pao de acucar|carrefour|extra\b|sams club/i,"Supermercado"],
  [/hortifrut|feirante|sacolão|supermercado|hiper|atacadão|assaí|rappi.*mercado/i,"Supermercado"],
  [/livup|jequitibazeiro|pagali|marmita|fit\s*food/i,"Marmitas"],
  [/ifood|uber\s*eats|rappi(?!.*mercado)|restauran|burguer|burger|sushi|pizza|bar\b|boteq|cervej/i,"Lazer"],
  [/cinema|netflix|ingress|show\b|teatro|entretenimento/i,"Lazer"],
  [/spotify|disney\+|amazon\s*prime|apple|google\s*(one|cloud|storage)|serasa/i,"Tecnologia"],
  [/soho\s*house|linkedin.*maria|cabelereir.*maria|nail.*maria/i,"Gastos Maria"],
  [/classpass|personal.*ryo|smiles\s*club|vgbl/i,"Gastos Ryo"],
  [/booking|airbnb|hotel|hostel|smiles|latam|gol\b|azul\s*linhas|123milhas|passagem/i,"Viagens"],
  [/casamento|noiv|buffet.*casam|decoraç.*casam|convite.*casam/i,"Casamento"],
  [/anuidade|iof\b|juros|tarifa|taxa\s*de\s*anuidade/i,"Outros (Saídas)"],
  [/reembols/i,"Reembolso"],[/estorno/i,"Reembolso"],[/devolu[çc]/i,"Reembolso"],
];
function categorizeStatic(desc) { if(!desc)return null; for(const[rx,cat]of STATIC_RULES){if(rx.test(String(desc)))return cat;} return null; }

// ─── SEED FC DATA ────────────────────────────────────────────────────────────
const FC_SEED = [
  {month:"Jun/25",O:{receitaMaria:18500,receitaRyo:54000,hedge:0,outrasReceitas:0,impostos:8100,investimento:15953,aluguel:15058.4,carro:1107.91,saude:3785.56,casa:1480,supermercado:1000,marmitas:730,lazer:3200,viagens:3000,tecnologia:331,gastosMaria:5400,gastosRyo:8100,casamento:7641.6,outros:1000},E:{receitaMaria:18500,receitaRyo:54000,hedge:11496.56,outrasReceitas:7255.91,impostos:8100,investimento:15832.88,aluguel:15058.4,carro:1338.88,saude:4636.14,casa:1625.18,supermercado:1333.53,marmitas:713.8,lazer:4424.05,viagens:12143.72,tecnologia:382.1,gastosMaria:8109.21,gastosRyo:9924.59,casamento:7048.6,outros:581.39}},
  {month:"Jul/25",O:{receitaMaria:18500,receitaRyo:54000,hedge:0,outrasReceitas:0,impostos:8100,investimento:12880,aluguel:15058.4,carro:1107.91,saude:3785.56,casa:1480,supermercado:1000,marmitas:730,lazer:3200,viagens:3000,tecnologia:331,gastosMaria:5400,gastosRyo:8100,casamento:7641.6,outros:1000},E:{receitaMaria:31281.02,receitaRyo:54000,hedge:7309.12,outrasReceitas:0,impostos:8100,investimento:10080.72,aluguel:15058.4,carro:2646.06,saude:4921.01,casa:1895.66,supermercado:1122.49,marmitas:407.78,lazer:6030.65,viagens:4076.5,tecnologia:449.09,gastosMaria:9900.29,gastosRyo:9038.92,casamento:15218,outros:3644.57}},
  {month:"Ago/25",O:{receitaMaria:18500,receitaRyo:54000,hedge:0,outrasReceitas:0,impostos:8100,investimento:22540,aluguel:15058.4,carro:1107.91,saude:3785.56,casa:1480,supermercado:1000,marmitas:730,lazer:3200,viagens:3000,tecnologia:331,gastosMaria:5400,gastosRyo:8100,casamento:9945.6,outros:1000},E:{receitaMaria:26215.15,receitaRyo:54000,hedge:10743.52,outrasReceitas:0,impostos:8100,investimento:20213.64,aluguel:15058.4,carro:2614.45,saude:4514.95,casa:1970.5,supermercado:1923.1,marmitas:366.82,lazer:5012.63,viagens:2267.93,tecnologia:399.45,gastosMaria:6377.06,gastosRyo:7806.58,casamento:13975.56,outros:357.6}},
  {month:"Set/25",O:{receitaMaria:18500,receitaRyo:54000,hedge:0,outrasReceitas:0,impostos:8100,investimento:12880,aluguel:15058.4,carro:1107.91,saude:3785.56,casa:1480,supermercado:1000,marmitas:730,lazer:3200,viagens:3000,tecnologia:331,gastosMaria:5400,gastosRyo:8100,casamento:7641.6,outros:1000},E:{receitaMaria:27647.62,receitaRyo:54000,hedge:9728.76,outrasReceitas:0,impostos:8100,investimento:8815.51,aluguel:15058.4,carro:920.37,saude:4904.7,casa:1747.65,supermercado:1676.52,marmitas:1045.8,lazer:3332.93,viagens:3293.13,tecnologia:478.1,gastosMaria:14496.65,gastosRyo:9654.76,casamento:16784.16,outros:1067.7}},
  {month:"Out/25",O:{receitaMaria:21500,receitaRyo:54000,hedge:0,outrasReceitas:0,impostos:8100,investimento:13480,aluguel:15058.4,carro:1107.91,saude:3785.56,casa:1480,supermercado:1000,marmitas:730,lazer:3200,viagens:3000,tecnologia:331,gastosMaria:5400,gastosRyo:8100,casamento:51081.6,outros:1000},E:{receitaMaria:21500,receitaRyo:54000,hedge:9785.93,outrasReceitas:0,impostos:8100,investimento:0,aluguel:15058.4,carro:2071.6,saude:4389.68,casa:3224.84,supermercado:3267.67,marmitas:0,lazer:3491.47,viagens:18856.96,tecnologia:426.3,gastosMaria:7956.17,gastosRyo:14017.45,casamento:48337.76,outros:442.65}},
  {month:"Nov/25",O:{receitaMaria:18500,receitaRyo:54000,hedge:0,outrasReceitas:0,impostos:8100,investimento:12880,aluguel:15058.4,carro:1107.91,saude:3785.56,casa:1480,supermercado:1000,marmitas:730,lazer:3200,viagens:3000,tecnologia:331,gastosMaria:5400,gastosRyo:8100,casamento:62485.2,outros:1000},E:{receitaMaria:6294.2,receitaRyo:54000,hedge:0,outrasReceitas:1200,impostos:8100,investimento:0,aluguel:15704.65,carro:1738.45,saude:2701.14,casa:1744.15,supermercado:966.31,marmitas:293.31,lazer:8651.75,viagens:26512.49,tecnologia:440.5,gastosMaria:2717.12,gastosRyo:4173.32,casamento:84844.65,outros:238.72}},
];

// Generate seed budget from FC_SEED.O
function buildInitBudget(){
  const b={};
  for(const s of FC_SEED){ b[s.month]={...s.O}; }
  return b;
}
const INIT_BUDGET=buildInitBudget();

// Generate seed transactions + income from historical FC data
function generateSeedEntries(){
  const seedTxns=[], seedIncome=[];
  for(const s of FC_SEED){
    const [mn,yr]=s.month.split("/");
    const mi=MONTH_NAMES.indexOf(mn);
    const date=new Date(2000+parseInt(yr),mi>=0?mi:0,15);
    for(const ek of EXPENSE_KEYS){
      const val=s.E[ek]||0;if(val<=0)continue;
      const catName=REV_KEY_MAP[ek]||"Outros (Saídas)";
      seedTxns.push({id:"seed-"+s.month+"-"+ek,date,description:catName,value:val,originalValue:val,currency:"BRL",brlValue:val,exchangeRate:1,category:catName,source:"Planilha FC",monthKey:s.month,confirmed:true});
    }
    if(s.E.receitaMaria>0)seedIncome.push({id:"sinc-"+s.month+"-m",monthKey:s.month,type:"maria",value:s.E.receitaMaria,desc:"Receita Maria"});
    if(s.E.receitaRyo>0)seedIncome.push({id:"sinc-"+s.month+"-r",monthKey:s.month,type:"ryo",value:s.E.receitaRyo,desc:"Receita Ryo"});
    if((s.E.hedge||0)+(s.E.outrasReceitas||0)>0)seedIncome.push({id:"sinc-"+s.month+"-o",monthKey:s.month,type:"outros",value:(s.E.hedge||0)+(s.E.outrasReceitas||0),desc:"Hedge + Outras Receitas"});
  }
  return {seedTxns,seedIncome};
}
const {seedTxns:INIT_TXNS,seedIncome:INIT_INCOME}=generateSeedEntries();

// ─── Utilities ───────────────────────────────────────────────────────────────
const fmt = v => v==null||isNaN(v)?"—":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
const fmtK = v => {if(v==null||isNaN(v))return"—";return Math.abs(v)>=1000?(v/1000).toFixed(0)+"k":v.toFixed(0);};

// ─── Multi-Currency Support ──────────────────────────────────────────────────
const SUPPORTED_CURRENCIES = ["BRL","USD","EUR","GBP","JPY","CHF","AUD","CAD","ARS","CLP","MXN","COP","PEN","UYU","BTC"];
const CURRENCY_SYMBOLS = {"R$":"BRL","$":"USD","€":"EUR","£":"GBP","¥":"JPY","Fr":"CHF","A$":"AUD","C$":"CAD","AR$":"ARS"};
const CURRENCY_LOCALE = {BRL:"pt-BR",USD:"en-US",EUR:"de-DE",GBP:"en-GB",JPY:"ja-JP",CHF:"de-CH",AUD:"en-AU",CAD:"en-CA",ARS:"es-AR",CLP:"es-CL",MXN:"es-MX",COP:"es-CO",PEN:"es-PE",UYU:"es-UY"};

function fmtCurrency(v, cur="BRL") {
  if(v==null||isNaN(v)) return "—";
  if(cur==="BTC") return v.toFixed(8)+" BTC";
  const locale = CURRENCY_LOCALE[cur] || "en-US";
  try { return new Intl.NumberFormat(locale,{style:"currency",currency:cur}).format(v); }
  catch(e) { return v.toFixed(2)+" "+cur; }
}

// Detect currency symbol in a raw value string and return {value, currency}
function parseValWithCurrency(raw) {
  if(raw==null) return {value:0, currency:"BRL"};
  if(typeof raw==="number") return {value:Math.abs(raw), currency:"BRL"};
  let s = String(raw).replace(/\u00a0/g,"").trim();
  let detected = "BRL";
  // Check longer symbols first (AR$, A$, C$, R$) then single-char
  for(const [sym, cur] of Object.entries(CURRENCY_SYMBOLS).sort((a,b)=>b[0].length-a[0].length)) {
    if(s.includes(sym)) { detected=cur; s=s.replace(sym,""); break; }
  }
  // Also detect 3-letter currency codes like "USD 150" or "150 EUR"
  const codeMatch = s.match(/\b(USD|EUR|GBP|JPY|CHF|AUD|CAD|ARS|CLP|MXN|COP|PEN|UYU|BRL)\b/i);
  if(codeMatch) { detected=codeMatch[1].toUpperCase(); s=s.replace(codeMatch[0],""); }
  // Parse the numeric value — handle both 1,234.56 (international) and 1.234,56 (BR) formats
  s = s.replace(/\s/g,"").trim();
  // Determine format: if last separator is comma and has 1-2 digits after → BR format
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if(lastComma > lastDot && /,\d{1,2}$/.test(s)) {
    // BR format: 1.234,56
    s = s.replace(/\./g,"").replace(",",".");
  } else if(lastDot > lastComma) {
    // International: 1,234.56
    s = s.replace(/,/g,"");
  } else if(lastComma>=0 && lastDot<0) {
    // Only comma: could be "1234,56" (BR) or "1,234" (intl thousands)
    if(/,\d{1,2}$/.test(s)) s = s.replace(",",".");
    else s = s.replace(/,/g,"");
  }
  const v = parseFloat(s);
  return {value: isNaN(v)?0:Math.abs(v), currency: detected};
}

// Exchange rate cache: {`${cur}-${dateStr}`: rate}
const _rateCache = {};
const _monthlyRateCache = {};

// Get monthly average exchange rate (for BRL conversion on categorization)
async function getMonthlyAvgRate(fromCur, monthKey) {
  if(fromCur==="BRL") return 1;
  const ck = `${fromCur}-${monthKey}`;
  if(_monthlyRateCache[ck]) return _monthlyRateCache[ck];
  const [mName,yy] = monthKey.split("/");
  const mi = MONTH_NAMES.indexOf(mName);
  const year = 2000+parseInt(yy);
  const firstDay = `${year}-${String(mi+1).padStart(2,"0")}-01`;
  const lastDay = mi===11 ? `${year+1}-01-01` : `${year}-${String(mi+2).padStart(2,"0")}-01`;
  // Try BCB PTAX monthly average for USD
  if(fromCur==="USD"){
    try{
      const url=`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)?@di='${firstDay}'&@df='${lastDay}'&$format=json`;
      const resp=await fetch(url);
      if(resp.ok){
        const data=await resp.json();
        const cotacoes=data.value||[];
        if(cotacoes.length>0){
          const avg=cotacoes.reduce((s,c)=>s+c.cotacaoVenda,0)/cotacoes.length;
          if(avg>0){_monthlyRateCache[ck]=Math.round(avg*10000)/10000;return _monthlyRateCache[ck];}
        }
      }
    }catch(e){/* fallback */}
  }
  // For other currencies or if BCB fails, get rate for the 15th of the month (mid-month approximation)
  const midDate = new Date(year, mi, 15);
  try{
    const rate = await getExchangeRate(fromCur, "BRL", midDate);
    _monthlyRateCache[ck] = rate;
    return rate;
  }catch(e){
    const fallback = {USD:5.50,EUR:6.00,GBP:7.00,JPY:0.037,CHF:6.30,AUD:3.60,CAD:4.00,ARS:0.005,CLP:0.006,MXN:0.30,COP:0.0013,PEN:1.45,UYU:0.13};
    return fallback[fromCur]||1;
  }
}

async function getExchangeRate(fromCur, toCur="BRL", date=null) {
  if(fromCur===toCur) return 1;
  const dateStr = date instanceof Date ? date.toISOString().slice(0,10) : (date || new Date().toISOString().slice(0,10));
  const cacheKey = `${fromCur}-${toCur}-${dateStr}`;
  if(_rateCache[cacheKey]) return _rateCache[cacheKey];
  // Try Banco Central do Brasil API for recent rates
  try {
    // BCB API uses currency codes: USD=1, EUR=21790, GBP=21791, JPY=21793, etc.
    const bcbCodes = {USD:"1",EUR:"21790",GBP:"21791",JPY:"21793",CHF:"21794",AUD:"21795",CAD:"21796",ARS:"3",MXN:"21800"};
    const bcbCode = bcbCodes[fromCur];
    if(bcbCode) {
      const fmtDate = dateStr.replace(/-/g,"").replace(/^(\d{4})(\d{2})(\d{2})$/,"$2-$3-$1");
      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@d)?@d='${dateStr}'&$format=json`;
      // For non-USD, use a simpler approach with exchangerate-api
      if(fromCur==="USD") {
        const resp = await fetch(url);
        if(resp.ok) {
          const data = await resp.json();
          const cotacoes = data.value;
          if(cotacoes && cotacoes.length>0) {
            const rate = cotacoes[cotacoes.length-1].cotacaoVenda;
            if(rate>0) { _rateCache[cacheKey]=rate; return rate; }
          }
        }
      }
    }
  } catch(e) { /* fallback below */ }
  // Fallback: use open exchange rate API
  try {
    const resp = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCur}`);
    if(resp.ok) {
      const data = await resp.json();
      const rate = data.rates?.[toCur];
      if(rate>0) { _rateCache[cacheKey]=rate; return rate; }
    }
  } catch(e) { /* fallback below */ }
  // Hardcoded fallback rates (approximate)
  const fallback = {USD:5.50,EUR:6.00,GBP:7.00,JPY:0.037,CHF:6.30,AUD:3.60,CAD:4.00,ARS:0.005,CLP:0.006,MXN:0.30,COP:0.0013,PEN:1.45,UYU:0.13};
  const rate = fallback[fromCur] || 1;
  _rateCache[cacheKey] = rate;
  return rate;
}

// Convert a transaction's value to BRL using exchange rate
async function convertToBRL(value, currency, date) {
  if(!currency || currency==="BRL") return value;
  const rate = await getExchangeRate(currency, "BRL", date);
  return Math.round(value * rate * 100) / 100;
}

function monthToSort(mk){const[m,y]=mk.split("/");const mi=MONTH_NAMES.indexOf(m);return(2000+parseInt(y))*12+(mi>=0?mi:0);}
function parseDate(raw){if(!raw)return null;if(raw instanceof Date)return raw;const s=String(raw).trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);const mm={jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};m=s.match(/^(\d{1,2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i);if(m)return new Date(new Date().getFullYear(),mm[m[2].toLowerCase()],+m[1]);const d=new Date(s);return isNaN(d.getTime())?null:d;}
function parseVal(raw){if(raw==null)return 0;if(typeof raw==="number")return Math.abs(raw);let s=String(raw).replace(/\u00a0/g,"").replace(/\s/g,"").replace("R$","").replace(/\./g,"").replace(",",".");const v=parseFloat(s);return isNaN(v)?0:Math.abs(v);}
function getMonthKey(d){if(!d)return null;return MONTH_NAMES[d.getMonth()]+"/"+String(d.getFullYear()).slice(2);}

// ─── Pattern Learning ─────────────────────────────────────────────────────
function extractLearnPattern(desc){if(!desc)return null;let s=String(desc).trim().toLowerCase();s=s.replace(/\s+[\d*#]{4,}$/g,"");s=s.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?$/g,"");s=s.replace(/\s+\d+\/\d+$/g,"");s=s.replace(/\s+/g," ").trim();return s.length>=3?s:null;}
function categorizeLearned(desc,patterns){if(!desc||!patterns||patterns.length===0)return null;const lower=String(desc).trim().toLowerCase();for(const p of patterns){if(lower===p.pattern)return p.category;}for(const p of patterns){if(lower.includes(p.pattern)||p.pattern.includes(lower))return p.category;}return null;}

function extractTxns(rows,fn){if(!rows||rows.length<2)return[];const h=rows[0].map(x=>String(x||"").toLowerCase().trim());let di=-1,de=-1,vi=-1,si=-1,ci=-1;for(let i=0;i<h.length;i++){if(di<0&&/data/.test(h[i]))di=i;if(de<0&&/descri/.test(h[i]))de=i;if(vi<0&&/valor/.test(h[i]))vi=i;if(si<0&&/fonte/.test(h[i]))si=i;if(ci<0&&/moeda|currency|cur\b/.test(h[i]))ci=i;}if(di<0)di=0;if(de<0)de=si>=0?2:1;if(vi<0)vi=h.length>=4?3:2;const txns=[];for(let i=1;i<rows.length;i++){const r=rows[i];if(!r||r.length<2)continue;const desc=String(r[de]||"").trim();const rawVal=r[vi];const {value:val,currency:detectedCur}=parseValWithCurrency(rawVal);const date=parseDate(r[di]);if(!desc||val===0)continue;const ac=categorizeStatic(desc);const currency=ci>=0?String(r[ci]||"").trim().toUpperCase()||detectedCur:detectedCur;txns.push({id:fn+"-"+i,date,description:desc,value:val,currency,originalValue:val,brlValue:currency==="BRL"?val:val,exchangeRate:currency==="BRL"?1:null,category:ac,source:si>=0?String(r[si]||"").trim():fn,monthKey:getMonthKey(date),confirmed:ac!==null});}return txns;}

// ─── Duplicate Detection ─────────────────────────────────────────────────────
function txnFingerprint(t){
  const d=t.date instanceof Date?t.date.toISOString().slice(0,10):"";
  const desc=(t.description||"").trim().toLowerCase();
  const val=Math.round((t.originalValue||t.value||0)*100);
  const cur=t.currency||"BRL";
  return desc+"|"+val+"|"+cur+"|"+d;
}
function deduplicateTxns(newTxns,existingTxns){
  const existingFP=new Set(existingTxns.map(txnFingerprint));
  const seen=new Set();
  const unique=[];
  let dupeCount=0;
  for(const t of newTxns){
    const fp=txnFingerprint(t);
    if(existingFP.has(fp)||seen.has(fp)){dupeCount++;continue;}
    seen.add(fp);
    unique.push(t);
  }
  return {unique,dupeCount};
}

// ─── Anthropic API headers ────────────────────────────────────────────────────
const _ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';
const ANTHROPIC_HEADERS = {"Content-Type":"application/json","x-api-key":_ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"};

// ─── PDF Support ─────────────────────────────────────────────────────────────
async function loadPdfJs(){if(window.pdfjsLib)return window.pdfjsLib;return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";resolve(window.pdfjsLib);};s.onerror=reject;document.head.appendChild(s);});}
async function parsePdfFile(file){const pdfjsLib=await loadPdfJs();const buf=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buf),cMapUrl:"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",cMapPacked:true}).promise;let fullText="";for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();const items=content.items.filter(it=>it.str.trim());if(items.length===0)continue;const sorted=[...items].sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4]);const lines=[];let curLine=[],curY=null;for(const item of sorted){const y=item.transform[5];if(curY===null||Math.abs(y-curY)<=5){curLine.push(item);if(curY===null)curY=y}else{if(curLine.length)lines.push(curLine.sort((a,b)=>a.transform[4]-b.transform[4]));curLine=[item];curY=y;}}if(curLine.length)lines.push(curLine.sort((a,b)=>a.transform[4]-b.transform[4]));for(const line of lines){let lt="";for(let i=0;i<line.length;i++){if(i>0){const gap=line[i].transform[4]-(line[i-1].transform[4]+(line[i-1].width||0));lt+=gap>8?"  ":gap>2?" ":"";}lt+=line[i].str;}fullText+=lt+"\n";}fullText+="\n";}if(!fullText.trim()){fullText="";for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();fullText+=content.items.map(it=>it.str).join(" ")+"\n";}}console.log("[PDF] Extracted "+fullText.length+" chars from "+pdf.numPages+" pages");return fullText;}
// Known card mappings: last 4 digits → source name
const CARD_SOURCE_MAP={"1218":"Maria Crédito Sicredi","1119":"Ryo Crédito Sicredi","1911":"Ryo Crédito Sicredi"};
function detectCardSource(text){
  // Look for known card number endings in the document text
  const sample=text.slice(0,5000);
  for(const[digits,name]of Object.entries(CARD_SOURCE_MAP)){
    // Match patterns like "final 1218", "****1218", "XXXX1218", "1218", "cartão ...1218"
    const re=new RegExp("(?:final|\\*{3,4}|x{3,4}|\\.\\.\\.)\\s*"+digits+"\\b","i");
    if(re.test(sample))return name;
  }
  return null;
}
async function identifyPdfSource(text){try{const sample=text.slice(0,3000);const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:ANTHROPIC_HEADERS,body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:`Analise o cabeçalho/início deste documento financeiro brasileiro e identifique:\n1. Tipo: "Cartão" (fatura de cartão de crédito) ou "Extrato" (extrato bancário)\n2. Banco/Instituição — ATENÇÃO a bancos com nomes similares:\n   - Sicredi ≠ Sicoob (são bancos DIFERENTES)\n   - Itaú ≠ Caixa Econômica Federal (são bancos DIFERENTES). Itaú Unibanco aparece como "ITAÚ", "ITAU UNIBANCO". Caixa aparece como "CAIXA ECONOMICA", "CEF".\n   - Procure pelo logo, nome do banco no cabeçalho ou CNPJ para identificar corretamente.\n3. Titular: nome COMPLETO da pessoa (se visível)\nResponda APENAS com JSON: {"nome":"Tipo Banco NomeCompleto"}\nEx: {"nome":"Cartão Sicredi Maria Silva"} ou {"nome":"Extrato Itaú João Santos"}`,messages:[{role:"user",content:sample}]})});const data=await resp.json();const raw=(data.content||[]).map(b=>b.text||"").join("").trim();let aiName=null;try{const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());aiName=parsed.nome||null;}catch{aiName=raw.length>0&&raw.length<60?raw:null;}
  // Override with card number detection if available (more reliable)
  const cardName=detectCardSource(text);
  return{sourceName:cardName||aiName,billingMonth:null};}catch(e){const cardName=detectCardSource(text);return{sourceName:cardName||null,billingMonth:null};}}
async function extractTxnsFromPdfAI(text,fn){
  const sourceInfo=await identifyPdfSource(text);const sourceName=sourceInfo.sourceName||fn;
  console.log("[PDF] Source:",sourceName);
  if(!text||text.trim().length<50){console.warn("[PDF] Text too short:",text.length);return{txns:[],sourceName,apiError:"Texto extraído do PDF muito curto ("+text.trim().length+" chars). PDF pode ser imagem."};}
  const maxChunk=6000;const chunks=[];let cur="";
  for(const line of text.split("\n")){if((cur+line).length>maxChunk&&cur.length>200){chunks.push(cur);cur=line+"\n";}else{cur+=line+"\n";}}
  if(cur.trim())chunks.push(cur);
  console.log("[PDF] "+chunks.length+" chunks to process, text length:",text.length);
  const allTxns=[];let apiError=null;
  for(let ci=0;ci<chunks.length;ci++){
    try{
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:ANTHROPIC_HEADERS,body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:4000,
        system:`Você é um extrator de transações financeiras de faturas de cartão de crédito e extratos bancários.
Extraia TODAS as transações/compras/pagamentos. Responda APENAS com JSON array, sem markdown.
Cada objeto: {"d":"DD/MM/YYYY","desc":"descrição","v":"150.00","cur":"BRL"}
REGRAS:
- Extraia TODAS as compras/débitos.
- Ignore cabeçalhos, totais, limites, mensagens informativas.
- Se data só DD/MM, use o ano mais provável baseado no contexto.
- IMPORTANTE: Use a DATA exata que aparece ao lado de cada transação no documento.
- Para compras parceladas, mantenha a informação de parcelas na descrição (ex: "LOJA XYZ 02/03").
- MOEDA: Identifique a moeda de cada transação. Use o código ISO (BRL, USD, EUR, GBP, JPY, etc).
  Se o documento é brasileiro e não indica outra moeda, use "BRL".
  Se aparecer $ sem contexto brasileiro, verifique se é USD ou BRL pelo contexto.
  Se a transação menciona "DOLAR", "IOF", "COMPRA INTERNACIONAL", provavelmente é USD.
  O campo "v" deve conter o valor NUMÉRICO (ex: "150.00"), sem símbolo de moeda.
- Ignore "pagamento de fatura", "saldo anterior".`,
        messages:[{role:"user",content:"Extraia TODAS as transações (parte "+(ci+1)+" de "+chunks.length+"):\n\n"+chunks[ci]}]})});
      if(!resp.ok){apiError="HTTP "+resp.status+": "+resp.statusText;console.error("[PDF] API HTTP error:",resp.status);break;}
      const data=await resp.json();
      if(data.error){apiError=(data.error.message||data.error.type||"Erro na API");console.error("[PDF] API error:",data.error);break;}
      const raw=(data.content||[]).map(b=>b.text||"").join("");
      console.log("[PDF] Chunk "+ci+" raw response ("+raw.length+" chars):",raw.slice(0,200));
      const cleaned=raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
      let parsed;
      try{parsed=JSON.parse(cleaned);}catch(pe){const arrMatch=cleaned.match(/\[[\s\S]*\]/);if(arrMatch){parsed=JSON.parse(arrMatch[0]);}else{console.error("[PDF] JSON parse failed, raw:",raw.slice(0,500));apiError="Resposta da IA não é JSON válido";continue;}}
      const arr=Array.isArray(parsed)?parsed:Array.isArray(parsed?.transactions)?parsed.transactions:Array.isArray(parsed?.data)?parsed.data:null;
      if(!arr){console.warn("[PDF] AI response not an array:",typeof parsed);continue;}
      for(let i=0;i<arr.length;i++){
        const t=arr[i];if(!t.desc||!t.v)continue;
        let ds=(t.d||"").trim();
        if(/^\d{1,2}\/\d{1,2}$/.test(ds))ds+="/"+new Date().getFullYear();
        else if(/^\d{1,2}\/\d{1,2}\/(\d{2})$/.test(ds))ds=ds.replace(/\/(\d{2})$/,"/20$1");
        const date=parseDate(ds),value=parseVal(t.v);
        if(value===0)continue;
        const desc=String(t.desc).trim(),ac=categorizeStatic(desc);
        const mk=getMonthKey(date);
        const currency=(t.cur||"BRL").toUpperCase();
        allTxns.push({id:fn+"-c"+ci+"-"+i,date,description:desc,value,originalValue:value,currency,brlValue:currency==="BRL"?value:value,exchangeRate:currency==="BRL"?1:null,category:ac,source:sourceName,monthKey:mk,confirmed:ac!==null});
      }
    }catch(e){console.error("[PDF] Chunk "+ci+" error:",e);apiError=e.message;}
  }
  console.log("[PDF] Extracted "+allTxns.length+" transactions total");
  // Convert foreign currency transactions to BRL
  for(const t of allTxns){
    if(t.currency && t.currency!=="BRL" && !t.exchangeRate){
      try{
        const rate=await getExchangeRate(t.currency,"BRL",t.date);
        t.exchangeRate=rate;
        t.brlValue=Math.round(t.originalValue*rate*100)/100;
      }catch(e){t.brlValue=t.originalValue;t.exchangeRate=1;}
    }
  }
  const normalized=normalizeInstallmentMonths(allTxns);
  return{txns:normalized,sourceName,apiError:normalized.length>0?null:apiError};
}

// ─── Installment detection & month normalization ─────────────────────────────
function detectInstallment(desc){
  if(!desc)return null;
  const s=String(desc);
  // Pattern 1: "parcela 01/03", "parc 01/03", "parc. 2/6"
  let m=s.match(/parcela?\s*\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
  // Pattern 2: "01/03" at end of description (optionally followed by " - cartão XXXX")
  if(!m)m=s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:\s*[-–]\s*cart[aã]o.*)?$/i);
  // Pattern 3: "01 de 03"
  if(!m)m=s.match(/(\d{1,2})\s+de\s+(\d{1,2})\s*$/i);
  if(!m)return null;
  const current=parseInt(m[1]),total=parseInt(m[2]);
  if(current<1||total<2||current>total||total>72)return null;
  return{current,total};
}
function installmentBaseKey(desc){
  // Extract base description removing installment suffix + trailing metadata
  return desc.replace(/\s*[-–]\s*[Pp]arcela?\s*\.?\s*\d+\s*\/\s*\d+/i,"")
    .replace(/\s*[-–]\s*cart[aã]o\s*.*/i,"")
    .replace(/\s+\d{1,2}\s*\/\s*\d{1,2}\s*(?:\s*[-–]\s*cart[aã]o.*)?$/i,"")
    .trim().toLowerCase();
}
function normalizeInstallmentMonths(txns){
  // Group installments by base description + total installments
  const groups={};
  txns.forEach((t,i)=>{
    const inst=detectInstallment(t.description);
    if(!inst||!t.date)return;
    const key=installmentBaseKey(t.description)+"::"+inst.total;
    if(!groups[key])groups[key]=[];
    groups[key].push({i,inst,date:t.date});
  });
  // For groups with 2+ members: use anchor (lowest N) to calculate correct months
  const fixes={};
  for(const members of Object.values(groups)){
    if(members.length<2)continue;
    members.sort((a,b)=>a.inst.current-b.inst.current);
    const anchor=members[0];
    const allSame=members.every(m=>m.date.getTime()===anchor.date.getTime());
    for(const m of members){
      const d=new Date(anchor.date);
      if(allSame){
        // Same date = purchase date for all → offset from installment 1
        d.setMonth(d.getMonth()+(m.inst.current-1));
      }else{
        // Different dates = billing dates → offset relative to anchor
        d.setMonth(d.getMonth()+(m.inst.current-anchor.inst.current));
      }
      fixes[m.i]=getMonthKey(d);
    }
  }
  if(Object.keys(fixes).length===0)return txns;
  return txns.map((t,i)=>fixes[i]!==undefined?{...t,monthKey:fixes[i]}:t);
}

// ─── AI Categorization ───────────────────────────────────────────────────────
async function aiCategorize(uncatTxns,newName,newDesc,allCats){const sample=uncatTxns.slice(0,80).map((t,i)=>i+"::"+t.description+"::"+t.value.toFixed(2));const catList=allCats.map(c=>c.name+": "+c.desc).join("\n");const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:ANTHROPIC_HEADERS,body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,system:"Você é um assistente financeiro. Responda APENAS com JSON válido.",messages:[{role:"user",content:`Identifique quais transações pertencem a "${newName}".\nDescrição: ${newDesc}\nOutras categorias:\n${catList}\n\nTransações:\n${sample.join("\n")}\n\nResponda com JSON array de índices. Ex: [0,3,7]\nSe nenhuma: []`}]})});const data=await resp.json();try{return JSON.parse((data.content||[]).map(b=>b.text||"").join("").replace(/```json|```/g,"").trim());}catch{return[];}}
async function aiRecategorizeAll(uncatTxns,allCats){const sample=uncatTxns.slice(0,80).map((t,i)=>i+"::"+t.description+"::"+t.value.toFixed(2));const catList=allCats.map(c=>c.name+": "+c.desc).join("\n");const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:ANTHROPIC_HEADERS,body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,system:"Você é um assistente financeiro. Responda APENAS com JSON válido.",messages:[{role:"user",content:`Categorize estas transações.\nCategorias:\n${catList}\n\nTransações:\n${sample.join("\n")}\n\nResponda com JSON object {índice:categoria}. Ex: {"0":"Lazer","3":"Casa"}\nInclua apenas as que tem confiança.`}]})});const data=await resp.json();try{return JSON.parse((data.content||[]).map(b=>b.text||"").join("").replace(/```json|```/g,"").trim());}catch{return{};}}

// ─── Theme Colors (Light) ────────────────────────────────────────────────
const C={
  bg:"#FFFFFF",bg2:"#F8F9FA",bg3:"#F1F3F5",
  card:"#FFFFFF",cardBorder:"#E9ECEF",
  t1:"#1A1A2E",t2:"#495057",t3:"#868E96",t4:"#ADB5BD",
  border:"#DEE2E6",borderLight:"#F1F3F5",
  green:"#2A9D8F",red:"#E8575A",purple:"#6C63FF",orange:"#F4845F",gold:"#E9C46A",
  greenBg:"rgba(42,157,143,0.08)",redBg:"rgba(232,87,90,0.06)",purpleBg:"rgba(108,99,255,0.08)",
};

// ─── Sub-components ──────────────────────────────────────────────────────────
function Modal({open,onClose,children,wide,compact}){if(!open)return null;return(<div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:compact?"flex-end":"center",justifyContent:"center"}} onClick={onClose}><div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.25)",backdropFilter:"blur(6px)"}}/><div style={{position:"relative",background:C.card,border:"1px solid "+C.cardBorder,borderRadius:compact?"20px 20px 0 0":20,padding:compact?20:32,maxWidth:wide?(compact?"100%":720):(compact?"100%":520),width:compact?"100%":"92%",maxHeight:compact?"90vh":"85vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}} onClick={e=>e.stopPropagation()}>{children}</div></div>);}

function RichLifeLogo({size=36}){
  const s=size/48;
  return(<svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <defs>
      <linearGradient id="rlbg" x1="0" y1="48" x2="48" y2="0"><stop offset="0%" stopColor="#1A5653"/><stop offset="100%" stopColor="#2A9D8F"/></linearGradient>
      <linearGradient id="rlleaf1" x1="16" y1="8" x2="30" y2="28"><stop offset="0%" stopColor="#6CD4A0"/><stop offset="100%" stopColor="#2A9D8F"/></linearGradient>
      <linearGradient id="rlleaf2" x1="30" y1="6" x2="20" y2="22"><stop offset="0%" stopColor="#A8E6CF"/><stop offset="100%" stopColor="#4CB89A"/></linearGradient>
      <linearGradient id="rlcoin" x1="14" y1="30" x2="34" y2="42"><stop offset="0%" stopColor="#F4D675"/><stop offset="100%" stopColor="#E9C46A"/></linearGradient>
    </defs>
    <rect width="48" height="48" rx="15" fill="url(#rlbg)"/>
    {/* Coin base */}
    <ellipse cx="24" cy="36" rx="11" ry="5" fill="url(#rlcoin)" opacity="0.9"/>
    <ellipse cx="24" cy="34.5" rx="11" ry="5" fill="#F7E896" opacity="0.85"/>
    <ellipse cx="24" cy="34.5" rx="8" ry="3.5" fill="none" stroke="#E0BE44" strokeWidth="0.7" opacity="0.5"/>
    {/* Stem */}
    <path d="M24 34 C24 28 23 24 22 20" stroke="#4CB89A" strokeWidth="2" strokeLinecap="round" fill="none"/>
    {/* Left leaf */}
    <path d="M22 20 C16 14 10 14 10 14 C10 14 12 22 22 22 Z" fill="url(#rlleaf1)" opacity="0.95"/>
    <path d="M22 21 C17 17 12 15.5 10.5 14.5" stroke="#2A9D8F" strokeWidth="0.5" opacity="0.5" fill="none" strokeLinecap="round"/>
    {/* Right leaf */}
    <path d="M23 17 C28 10 36 8 36 8 C36 8 32 18 23 19 Z" fill="url(#rlleaf2)" opacity="0.95"/>
    <path d="M23.5 18 C28 12.5 33.5 9 35.5 8.5" stroke="#4CB89A" strokeWidth="0.5" opacity="0.4" fill="none" strokeLinecap="round"/>
    {/* Small sparkle on coin */}
    <circle cx="28" cy="33" r="1" fill="white" opacity="0.6"/>
    <circle cx="19" cy="34.5" r="0.6" fill="white" opacity="0.35"/>
  </svg>);
}

// ═══════════════════════════════════════════════════════════════════════════════
const STORAGE_KEY = "richlife-data";

// ─── Supabase Cloud Storage ───────────────────────────────────────────────
const _SB_URL = import.meta.env.VITE_SUPABASE_URL || '';
const _SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = _SB_URL && _SB_KEY ? createClient(_SB_URL, _SB_KEY) : null;
const CLIENT_ID = Math.random().toString(36).slice(2, 10);

// Storage: Supabase cloud → localStorage fallback
if (typeof window !== "undefined") {
  window.storage = {
    get: async (key) => {
      if (supabase) {
        try {
          const { data, error } = await supabase.from('app_state').select('data').eq('id', key).single();
          if (!error && data?.data) return { value: JSON.stringify(data.data) };
        } catch (e) { /* fallback below */ }
      }
      try { return { value: localStorage.getItem(key) }; } catch(e) { return null; }
    },
    set: async (key, val) => {
      try { localStorage.setItem(key, val); } catch(e) {}
      if (supabase) {
        try {
          const parsed = JSON.parse(val);
          parsed._clientId = CLIENT_ID;
          await supabase.from('app_state').upsert({ id: key, data: parsed, updated_at: new Date().toISOString() });
        } catch (e) { console.warn('Cloud sync failed', e); }
      }
    },
    delete: async (key) => {
      try { localStorage.removeItem(key); } catch(e) {}
      if (supabase) { try { await supabase.from('app_state').delete().eq('id', key); } catch(e) {} }
    },
  };
}

// Serialize txns (Date → ISO string)
function serializeData(data){
  return JSON.stringify({
    ...data,
    txns: data.txns.map(t=>({...t, date: t.date instanceof Date ? t.date.toISOString() : t.date})),
  });
}
// Deserialize txns (ISO string → Date) + auto-correct known source name errors + normalize installment months
const SOURCE_FIX={"Extrato Caixa Maria Brasil Pereira":"Extrato Itaú Maria Brasil Pereira","Cartão Sicredi Ryoichi Oka Penna":"Cartão Sicredi Maria"};
function deserializeTxns(txns){
  const fixed=txns.map(t=>{
    const d=t.date?new Date(t.date):null;const src=SOURCE_FIX[t.source]||t.source;const mk=d?getMonthKey(d):(t.monthKey||"");
    // Migration: add currency fields to old data that lacks them
    const currency=t.currency||"BRL";
    const originalValue=t.originalValue!=null?t.originalValue:t.value;
    const brlValue=t.brlValue!=null?t.brlValue:t.value;
    const exchangeRate=t.exchangeRate!=null?t.exchangeRate:1;
    return{...t,date:d,source:src,monthKey:mk,currency,originalValue,brlValue,exchangeRate};
  });
  return normalizeInstallmentMonths(fixed);
}

export default function App(){
  const [loaded,setLoaded]=useState(false);
  const [view,setView]=useState("dashboard");
  const [categories,setCategories]=useState(DEFAULT_CATEGORIES);
  const [txns,setTxns]=useState(INIT_TXNS);
  const [income,setIncome]=useState(INIT_INCOME);
  const [budget,setBudget]=useState(INIT_BUDGET);
  const [investments,setInvestments]=useState([]);
  // Undo/Redo history
  const MAX_HISTORY=30;
  const [txnHistory,setTxnHistory]=useState([]);
  const [txnFuture,setTxnFuture]=useState([]);
  const [invHistory,setInvHistory]=useState([]);
  const [invFuture,setInvFuture]=useState([]);
  const [files,setFiles]=useState([]);
  const [fMonth,setFMonth]=useState("all");
  const [editId,setEditId]=useState(null);
  const [editingCell,setEditingCell]=useState(null);
  const [editVal,setEditVal]=useState("");
  const [editCurrency,setEditCurrency]=useState("BRL");
  const [drag,setDrag]=useState(false);
  const [selMonth,setSelMonth]=useState(null);
  const fileRef=useRef(null);
  const fcTableRef=useRef(null);

  const [showNewCat,setShowNewCat]=useState(false);
  const [newCatName,setNewCatName]=useState("");
  const [newCatDesc,setNewCatDesc]=useState("");
  const [newCatColor,setNewCatColor]=useState(PALETTE[13]);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiResult,setAiResult]=useState(null);
  const [deleteCat,setDeleteCat]=useState(null);
  const [editCat,setEditCat]=useState(null);
  const [editCatDesc,setEditCatDesc]=useState("");
  const [uploadStatus,setUploadStatus]=useState(null);
  const [completedMonths,setCompletedMonths]=useState({});
  const [learnedPatterns,setLearnedPatterns]=useState([]);
  const [recatResult,setRecatResult]=useState(null);
  const [pieMonths,setPieMonths]=useState([]);

  // Responsive
  const [winW,setWinW]=useState(typeof window!=="undefined"?window.innerWidth:1440);
  const isMobile=winW<640;

  const [showIncome,setShowIncome]=useState(false);
  const [incType,setIncType]=useState("maria");
  const [incValue,setIncValue]=useState("");
  const [incMonth,setIncMonth]=useState("");
  const [incDesc,setIncDesc]=useState("");

  // Manual expense entry
  const [showExpense,setShowExpense]=useState(false);
  const [expMonth,setExpMonth]=useState("");
  const [expValue,setExpValue]=useState("");
  const [expDesc,setExpDesc]=useState("");
  const [expCat,setExpCat]=useState("");
  const [expDate,setExpDate]=useState("");
  const [expCurrency,setExpCurrency]=useState("BRL");

  // Budget editor
  const [showBudget,setShowBudget]=useState(false);
  const [budgetMonth,setBudgetMonth]=useState("");
  const [budgetDraft,setBudgetDraft]=useState({});

  // Investments UI
  const [showNewInv,setShowNewInv]=useState(false);
  const [editInvId,setEditInvId]=useState(null); // null=new, string=editing
  const [invDraft,setInvDraft]=useState({value:"",tipo:"fixa",desc:"",rate:"",rateMode:"year",monthKey:""});
  const [editInvCell,setEditInvCell]=useState(null); // {invId, monthKey}
  const [editInvVal,setEditInvVal]=useState("");

  // Sort & filter
  const [reviewSort,setReviewSort]=useState({col:"date",dir:"desc"});
  const [reviewSearch,setReviewSearch]=useState("");
  const [reviewDateFrom,setReviewDateFrom]=useState("");
  const [reviewDateTo,setReviewDateTo]=useState("");
  const [reviewShowAll,setReviewShowAll]=useState(false);
  const [selectedTxns,setSelectedTxns]=useState(new Set());
  const lastClickedIdx=useRef(null);
  const [bulkAction,setBulkAction]=useState(null); // null | "category" | "source" | "monthKey"
  const [bulkValue,setBulkValue]=useState("");
  const [detailSort,setDetailSort]=useState({col:"date",dir:"desc"});
  const [detailSearch,setDetailSearch]=useState("");
  const [detailCatFilter,setDetailCatFilter]=useState("all");
  const [detailDateFrom,setDetailDateFrom]=useState("");
  const [detailDateTo,setDetailDateTo]=useState("");
  const [incSort,setIncSort]=useState({col:"type",dir:"asc"});
  const [incSearch,setIncSearch]=useState("");
  const [incTypeFilter,setIncTypeFilter]=useState("all");

  useEffect(()=>{const onResize=()=>setWinW(window.innerWidth);window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize);},[]);
  useEffect(()=>{setDetailSearch("");setIncSearch("");setDetailCatFilter("all");setDetailDateFrom("");setDetailDateTo("");setIncTypeFilter("all");},[selMonth]);

  // ─── Persistence: Load ─────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      try{
        const result=await window.storage.get(STORAGE_KEY);
        if(result&&result.value){
          const data=JSON.parse(result.value);
          if(data.categories)setCategories(data.categories);
          if(data.txns)setTxns(deserializeTxns(data.txns));
          if(data.income)setIncome(data.income);
          if(data.budget)setBudget(data.budget);
          if(data.investments)setInvestments(data.investments);
          if(data.files)setFiles(data.files);
          if(data.completedMonths)setCompletedMonths(data.completedMonths);
          if(data.learnedPatterns)setLearnedPatterns(data.learnedPatterns);
        }
      }catch(e){/* first load or no data */}
      setLoaded(true);
    })();
  },[]);

  // ─── Persistence: Save on changes ─────────────────────────────────────────
  const saveTimer=useRef(null);
  const isRemoteUpdate=useRef(false);
  useEffect(()=>{
    if(!loaded)return;
    if(isRemoteUpdate.current){isRemoteUpdate.current=false;return;}
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      try{
        await window.storage.set(STORAGE_KEY,serializeData({categories,txns,income,budget,investments,files,completedMonths,learnedPatterns}));
      }catch(e){console.error("Save failed",e);}
    },800);
    return()=>{if(saveTimer.current)clearTimeout(saveTimer.current)};
  },[categories,txns,income,budget,investments,files,completedMonths,learnedPatterns,loaded]);

  const [saveStatus,setSaveStatus]=useState("");
  useEffect(()=>{
    if(!loaded)return;
    if(isRemoteUpdate.current)return;
    setSaveStatus("salvando...");
    const t=setTimeout(()=>setSaveStatus(supabase?"sincronizado ☁":"salvo ✓"),1200);
    return()=>clearTimeout(t);
  },[categories,txns,income,budget,investments,files,completedMonths,learnedPatterns]);

  // ─── Real-time sync from other devices ──────────────────────────────────
  useEffect(()=>{
    if(!supabase||!loaded)return;
    const channel=supabase.channel('sync').on(
      'postgres_changes',
      {event:'*',schema:'public',table:'app_state',filter:`id=eq.${STORAGE_KEY}`},
      (payload)=>{
        const d=payload.new?.data;
        if(!d||d._clientId===CLIENT_ID)return;
        isRemoteUpdate.current=true;
        // Clear undo/redo history on remote sync to avoid conflicts
        setTxnHistory([]);setTxnFuture([]);setInvHistory([]);setInvFuture([]);
        if(d.categories)setCategories(d.categories);
        if(d.txns)setTxns(deserializeTxns(d.txns));
        if(d.income)setIncome(d.income);
        if(d.budget)setBudget(d.budget);
        if(d.investments)setInvestments(d.investments);
        if(d.files)setFiles(d.files);
        if(d.completedMonths)setCompletedMonths(d.completedMonths);
        if(d.learnedPatterns)setLearnedPatterns(d.learnedPatterns);
        setSaveStatus("atualizado ↓");
      }
    ).subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[loaded]);

  const handleResetData=useCallback(async()=>{
    if(!confirm("Isso vai apagar TODOS os seus dados salvos e voltar ao estado inicial. Tem certeza?"))return;
    try{await window.storage.delete(STORAGE_KEY);}catch(e){}
    setCategories(DEFAULT_CATEGORIES);setTxns(INIT_TXNS);setIncome(INIT_INCOME);
    setBudget(INIT_BUDGET);setInvestments([]);setFiles([]);setCompletedMonths({});setLearnedPatterns([]);
  },[]);

  const catNames=useMemo(()=>categories.map(c=>c.name),[categories]);
  const catColorMap=useMemo(()=>{const m={};categories.forEach(c=>m[c.name]=c.color);return m;},[categories]);

  // ─── Build dynamic FC ──────────────────────────────────────────────────────
  const fcData = useMemo(()=>{
    const txnAgg={};
    for(const t of txns){if(!t.monthKey||!t.category)continue;if(!txnAgg[t.monthKey])txnAgg[t.monthKey]={};const k=KEY_MAP[t.category]||"outros";txnAgg[t.monthKey][k]=(txnAgg[t.monthKey][k]||0)+(t.brlValue!=null?t.brlValue:t.value);}
    const incAgg={};
    for(const inc of income){if(!incAgg[inc.monthKey])incAgg[inc.monthKey]={maria:0,ryo:0,outros:0};incAgg[inc.monthKey][inc.type]=(incAgg[inc.monthKey][inc.type]||0)+inc.value;}
    const allMonths=new Set();
    Object.keys(txnAgg).forEach(mk=>allMonths.add(mk));
    Object.keys(incAgg).forEach(mk=>allMonths.add(mk));
    Object.keys(budget).forEach(mk=>allMonths.add(mk));
    FC_SEED.forEach(s=>allMonths.add(s.month));
    // Always include 3 months before today + current + next 12 months
    const _now=new Date();for(let i=-3;i<=12;i++){const d=new Date(_now);d.setMonth(d.getMonth()+i);const mk=getMonthKey(d);if(mk)allMonths.add(mk);}
    const sorted=[...allMonths].sort((a,b)=>monthToSort(a)-monthToSort(b));
    const catKeys=Object.values(KEY_MAP);
    const nonReembolsoKeys=catKeys.filter(k=>k!=="reembolso");

    return sorted.map(mk=>{
      const bud=budget[mk]||{};
      const tAgg=txnAgg[mk]||{};
      const iAgg=incAgg[mk]||{maria:0,ryo:0,outros:0};
      const hasTxnData=Object.keys(tAgg).length>0;
      const seed=FC_SEED.find(s=>s.month===mk);

      // Orçado: from budget state (user-editable), fallback to seed
      const O={};
      for(const k of [...BUDGET_INCOME_KEYS,...catKeys]){O[k]=bud[k]!=null?bud[k]:(seed?seed.O[k]||0:0);}

      // Executado
      const E={receitaMaria:iAgg.maria,receitaRyo:iAgg.ryo,hedge:seed?seed.E.hedge:0,outrasReceitas:iAgg.outros,impostos:seed?seed.E.impostos:0,investimento:seed?seed.E.investimento:0};
      for(const ck of catKeys){E[ck]=hasTxnData?(tAgg[ck]||0):(seed?seed.E[ck]||0:0);}

      const receitaTotal=(E.receitaMaria||0)+(E.receitaRyo||0)+(E.hedge||0)+(E.outrasReceitas||0);
      const totalSaidas=nonReembolsoKeys.reduce((s,k)=>s+(E[k]||0),0);
      O.receitaTotal=(O.receitaMaria||0)+(O.receitaRyo||0)+(O.hedge||0)+(O.outrasReceitas||0);
      O.totalSaidas=nonReembolsoKeys.reduce((s,k)=>s+(O[k]||0),0);

      return {month:mk,O:{...O},E:{...E,receitaTotal,totalSaidas}};
    });
  },[txns,income,budget]);

  const fcMonths=useMemo(()=>fcData.map(m=>m.month),[fcData]);
  const latestMonth=fcData.length>0?fcData[fcData.length-1].month:null;

  // Scroll FC table so current month is visible (3 before + current + 3 after)
  useEffect(()=>{
    if(!fcTableRef.current||fcData.length===0)return;
    const _nowMK=getMonthKey(new Date());
    const nowIdx=fcData.findIndex(m=>m.month===_nowMK);
    if(nowIdx<0)return;
    const targetIdx=Math.max(0,nowIdx-3);
    // Each month has ~2 columns (~140px), first col ~150px
    const scrollPos=targetIdx*140;
    fcTableRef.current.scrollLeft=scrollPos;
  },[fcData,view]);

  // ─── Dashboard chart data ─────────────────────────────────────────────────
  // Show 3 months before + current + 3 months after in the chart
  const dashChart=useMemo(()=>{
    return fcData.map(m=>{
    const rec=m.E.receitaTotal||0;
    const gas=m.E.totalSaidas||0;
    const inv=m.E.investimento||0;
    return{month:m.month,receita:rec,gastos:gas,investimento:inv,saldo:rec-inv-gas};
  });
  },[fcData]);

  // ─── Pie chart data ─────────────────────────────────────────────────────
  const _nowMKPie=getMonthKey(new Date());
  const pieData=useMemo(()=>{
    const targetMonths=pieMonths.length>0?pieMonths:[_nowMKPie];
    const targetSet=new Set(targetMonths);
    const relevantTxns=txns.filter(t=>t.monthKey&&targetSet.has(t.monthKey)&&t.category&&t.category!=="Reembolso");
    const agg={};for(const t of relevantTxns){agg[t.category]=(agg[t.category]||0)+(t.brlValue!=null?t.brlValue:t.value);}
    const total=Object.values(agg).reduce((s,v)=>s+v,0);
    return Object.entries(agg).map(([name,value])=>({name,value:Math.round(value*100)/100,color:catColorMap[name]||"#999",pct:total>0?((value/total)*100).toFixed(1):"0"})).sort((a,b)=>b.value-a.value);
  },[txns,pieMonths,_nowMKPie,catColorMap]);
  const pieTotalValue=useMemo(()=>pieData.reduce((s,d)=>s+d.value,0),[pieData]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleFiles=useCallback(async(fileList)=>{const res=[];for(const f of fileList){try{if(f.name.toLowerCase().endsWith(".pdf")){setUploadStatus({msg:"Extraindo texto de "+f.name+"...",loading:true});const text=await parsePdfFile(f);if(!text||text.trim().length<30){setUploadStatus({msg:"Erro: não conseguiu extrair texto do PDF ("+text.length+" chars). Pode ser PDF de imagem.",loading:false});continue;}setUploadStatus({msg:"IA extraindo transações ("+text.length+" chars)...",loading:true});const{txns:pdfTxns,sourceName,apiError}=await extractTxnsFromPdfAI(text,f.name);if(apiError&&pdfTxns.length===0){setUploadStatus({msg:"Erro: "+apiError,loading:false});continue;}res.push(...pdfTxns);setUploadStatus({msg:pdfTxns.length+" transações extraídas — "+sourceName,loading:false});}else{const buf=await f.arrayBuffer();const wb=XLSX.read(new Uint8Array(buf),{type:"array",cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:"yyyy-mm-dd"});res.push(...extractTxns(rows,f.name));}setFiles(p=>[...p,f.name]);}catch(e){console.error(e);setUploadStatus({msg:"Erro: "+f.name,loading:false});}}
    // Convert foreign currency transactions from XLSX to BRL
    for(const t of res){
      if(t.currency && t.currency!=="BRL" && !t.exchangeRate){
        try{const rate=await getExchangeRate(t.currency,"BRL",t.date);t.exchangeRate=rate;t.brlValue=Math.round(t.originalValue*rate*100)/100;}
        catch(e){t.brlValue=t.originalValue;t.exchangeRate=1;}
      }
    }
    // Apply learned patterns to uncategorized results
    for(const t of res){if(!t.category){const learned=categorizeLearned(t.description,learnedPatterns);if(learned){t.category=learned;t.confirmed=true;}}}
    // Deduplicate against existing txns and within the batch
    const foreignCount=res.filter(t=>t.currency&&t.currency!=="BRL").length;
    pushTxnHistory();setTxns(p=>{const{unique,dupeCount}=deduplicateTxns(res,p);const msg=unique.length+" novas transações"+(dupeCount>0?" ("+dupeCount+" duplicadas removidas)":"")+(foreignCount>0?" · "+foreignCount+" em moeda estrangeira":"");if(unique.length>0||dupeCount>0){setUploadStatus({msg:"Pronto! "+msg+".",loading:false});}return[...p,...unique];});if(res.length>0){setView("review");}},[learnedPatterns]);
  const updateCat=useCallback((id,cat)=>{pushTxnHistory();const txn=txns.find(t=>t.id===id);if(txn&&cat&&!txn.confirmed){const pattern=extractLearnPattern(txn.description);if(pattern)setLearnedPatterns(prev=>{if(prev.some(lp=>lp.pattern===pattern&&lp.category===cat))return prev;return[...prev.filter(lp=>lp.pattern!==pattern),{pattern,category:cat,createdAt:new Date().toISOString()}];});}setTxns(p=>p.map(t=>t.id===id?{...t,category:cat,confirmed:true}:t));setEditId(null);
    // Auto-convert non-BRL to BRL using monthly avg rate on categorization
    if(txn&&txn.currency&&txn.currency!=="BRL"&&(!txn.exchangeRate||txn.exchangeRate===1)&&txn.monthKey){
      (async()=>{try{const rate=await getMonthlyAvgRate(txn.currency,txn.monthKey);if(rate>0&&rate!==1){setTxns(p=>p.map(t=>t.id===id?{...t,exchangeRate:rate,brlValue:Math.round((t.originalValue||t.value)*rate*100)/100,_needsRateUpdate:undefined}:t));}}catch(e){}})();
    }},[txns]);
  const startEdit=useCallback((id,field,type,currentVal)=>{setEditingCell({id,field,type});setEditVal(currentVal||"");},[]);
  const commitEdit=useCallback(()=>{if(!editingCell)return;const{id,field,type}=editingCell;const val=editVal;if(type==="txn"){pushTxnHistory();setTxns(p=>p.map(t=>{if(t.id!==id)return t;const u={...t};if(field==="description")u.description=val;else if(field==="value"){const newVal=parseVal(val);const cur=editCurrency||t.currency||"BRL";u.originalValue=newVal;u.value=newVal;u.currency=cur;if(cur==="BRL"){u.brlValue=newVal;u.exchangeRate=1;}else{const rate=t.exchangeRate||(cur===t.currency?t.exchangeRate:null);if(rate&&cur===t.currency){u.brlValue=Math.round(newVal*rate*100)/100;}else{u.brlValue=newVal;u._needsRateUpdate=true;}}if(cur!==t.currency)u._needsRateUpdate=true;}else if(field==="source")u.source=val;else if(field==="category"){if(val&&!t.confirmed){const pattern=extractLearnPattern(t.description);if(pattern)setLearnedPatterns(prev=>{if(prev.some(lp=>lp.pattern===pattern&&lp.category===val))return prev;return[...prev.filter(lp=>lp.pattern!==pattern),{pattern,category:val,createdAt:new Date().toISOString()}];});}u.category=val||null;u.confirmed=!!val;}else if(field==="date"){const d=parseDate(val);if(d){u.date=d;u.monthKey=getMonthKey(d);}}else if(field==="monthKey"){u.monthKey=val;}return u;}));}else if(type==="inc"){setIncome(p=>p.map(inc=>{if(inc.id!==id)return inc;const u={...inc};if(field==="desc")u.desc=val;else if(field==="value")u.value=parseVal(val);else if(field==="type")u.type=val;else if(field==="monthKey")u.monthKey=val;return u;}));}setEditingCell(null);setEditVal("");setEditCurrency("BRL");},[editingCell,editVal,editCurrency]);
  // Auto-fetch exchange rates for transactions that need them
  useEffect(()=>{
    const needsRate=txns.filter(t=>t._needsRateUpdate||(!t.exchangeRate&&t.currency&&t.currency!=="BRL"));
    if(needsRate.length===0)return;
    (async()=>{
      const updates={};
      for(const t of needsRate){
        try{
          const rate=await getExchangeRate(t.currency,"BRL",t.date);
          updates[t.id]={exchangeRate:rate,brlValue:Math.round(t.originalValue*rate*100)/100};
        }catch(e){updates[t.id]={exchangeRate:1,brlValue:t.originalValue};}
      }
      if(Object.keys(updates).length>0){
        setTxns(p=>p.map(t=>{
          const upd=updates[t.id];
          if(!upd)return t;
          return{...t,...upd,_needsRateUpdate:undefined};
        }));
      }
    })();
  },[txns.filter(t=>t._needsRateUpdate||(!t.exchangeRate&&t.currency&&t.currency!=="BRL")).length]);
  const cancelEdit=useCallback(()=>{setEditingCell(null);setEditVal("");setEditCurrency("BRL");},[]);
  const isEditing=useCallback((id,field,type)=>editingCell&&editingCell.id===id&&editingCell.field===field&&editingCell.type===type,[editingCell]);
  // Undo/Redo helpers
  const pushTxnHistory=useCallback(()=>{setTxnHistory(h=>[...h.slice(-(MAX_HISTORY-1)),txns]);setTxnFuture([]);},[txns]);
  const pushInvHistory=useCallback(()=>{setInvHistory(h=>[...h.slice(-(MAX_HISTORY-1)),investments]);setInvFuture([]);},[investments]);
  const undoTxns=useCallback(()=>{if(txnHistory.length===0)return;const prev=txnHistory[txnHistory.length-1];setTxnFuture(f=>[...f,txns]);setTxns(prev);setTxnHistory(h=>h.slice(0,-1));},[txnHistory,txns]);
  const redoTxns=useCallback(()=>{if(txnFuture.length===0)return;const next=txnFuture[txnFuture.length-1];setTxnHistory(h=>[...h,txns]);setTxns(next);setTxnFuture(f=>f.slice(0,-1));},[txnFuture,txns]);
  const undoInv=useCallback(()=>{if(invHistory.length===0)return;const prev=invHistory[invHistory.length-1];setInvFuture(f=>[...f,investments]);setInvestments(prev);setInvHistory(h=>h.slice(0,-1));},[invHistory,investments]);
  const redoInv=useCallback(()=>{if(invFuture.length===0)return;const next=invFuture[invFuture.length-1];setInvHistory(h=>[...h,investments]);setInvestments(next);setInvFuture(f=>f.slice(0,-1));},[invFuture,investments]);
  // Undo/Redo keyboard shortcuts
  useEffect(()=>{const handler=(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();if(view==="review")undoTxns();else if(view==="investments")undoInv();}else if((e.ctrlKey||e.metaKey)&&(e.key==="y"||(e.key==="z"&&e.shiftKey))){e.preventDefault();if(view==="review")redoTxns();else if(view==="investments")redoInv();}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[view,undoTxns,redoTxns,undoInv,redoInv]);
  const handleCreateCat=useCallback(async()=>{if(!newCatName.trim()||!newCatDesc.trim())return;const name=newCatName.trim(),cat={name,color:newCatColor,desc:newCatDesc.trim()};setCategories(prev=>[...prev,cat]);const uncat=txns.filter(t=>!t.category);if(uncat.length>0){setAiLoading(true);try{const indices=await aiCategorize(uncat,name,newCatDesc.trim(),[...categories,cat]);setAiResult({indices,catName:name,txnIds:indices.map(i=>uncat[i]?.id).filter(Boolean)});}catch(e){setAiResult({indices:[],catName:name,txnIds:[],error:true});}setAiLoading(false);}else{setShowNewCat(false);setNewCatName("");setNewCatDesc("");}},[newCatName,newCatDesc,newCatColor,categories,txns]);
  const acceptAi=useCallback(()=>{if(!aiResult)return;pushTxnHistory();setTxns(p=>p.map(t=>aiResult.txnIds.includes(t.id)?{...t,category:aiResult.catName,confirmed:true}:t));setAiResult(null);setShowNewCat(false);setNewCatName("");setNewCatDesc("");},[aiResult]);
  const rejectAi=useCallback(()=>{setAiResult(null);setShowNewCat(false);setNewCatName("");setNewCatDesc("");},[]);
  const confirmDeleteCat=useCallback(()=>{if(!deleteCat)return;setCategories(p=>p.filter(c=>c.name!==deleteCat));setTxns(p=>p.map(t=>t.category===deleteCat?{...t,category:null,confirmed:false}:t));setDeleteCat(null);},[deleteCat]);
  const handleEditCatSave=useCallback(()=>{if(!editCat||!editCatDesc.trim())return;setCategories(p=>p.map(c=>c.name===editCat?{...c,desc:editCatDesc.trim()}:c));setEditCat(null);},[editCat,editCatDesc]);
  const handleAiRecat=useCallback(async()=>{let uncat=txns.filter(t=>!t.category);if(uncat.length===0)return;
    // First: apply learned patterns silently
    if(learnedPatterns.length>0){let lc=0;setTxns(p=>p.map(t=>{if(t.category)return t;const learned=categorizeLearned(t.description,learnedPatterns);if(learned){lc++;return{...t,category:learned,confirmed:true};}return t;}));uncat=uncat.filter(t=>!categorizeLearned(t.description,learnedPatterns));if(uncat.length===0)return;}
    setAiLoading(true);try{const mapping=await aiRecategorizeAll(uncat,categories);const valid=new Set(catNames);const proposals=[];for(const[idx,cat]of Object.entries(mapping)){if(!valid.has(cat))continue;const tx=uncat[parseInt(idx)];if(!tx)continue;proposals.push({txnId:tx.id,description:tx.description,value:tx.value,category:cat});}setRecatResult(proposals);}catch(e){console.error(e);}setAiLoading(false);},[txns,categories,catNames,learnedPatterns]);
  const acceptRecat=useCallback(()=>{if(!recatResult)return;pushTxnHistory();const foreignTxns=[];setTxns(p=>{const n=[...p];for(const r of recatResult){const ri=n.findIndex(t=>t.id===r.txnId);if(ri>=0){n[ri]={...n[ri],category:r.category,confirmed:true};if(n[ri].currency&&n[ri].currency!=="BRL"&&(!n[ri].exchangeRate||n[ri].exchangeRate===1)&&n[ri].monthKey)foreignTxns.push({id:n[ri].id,currency:n[ri].currency,monthKey:n[ri].monthKey});const pattern=extractLearnPattern(n[ri].description);if(pattern)setLearnedPatterns(prev=>{if(prev.some(lp=>lp.pattern===pattern&&lp.category===r.category))return prev;return[...prev.filter(lp=>lp.pattern!==pattern),{pattern,category:r.category,createdAt:new Date().toISOString()}];});}}return n;});setRecatResult(null);
    if(foreignTxns.length>0){(async()=>{const updates={};for(const ft of foreignTxns){try{const rate=await getMonthlyAvgRate(ft.currency,ft.monthKey);if(rate>0&&rate!==1)updates[ft.id]={exchangeRate:rate};}catch(e){}}if(Object.keys(updates).length>0){setTxns(p=>p.map(t=>{const u=updates[t.id];if(!u)return t;return{...t,exchangeRate:u.exchangeRate,brlValue:Math.round((t.originalValue||t.value)*u.exchangeRate*100)/100,_needsRateUpdate:undefined};}));}})();}},[recatResult]);
  const rejectRecat=useCallback(()=>{setRecatResult(null);},[]);
  const addIncome=useCallback(()=>{const val=parseVal(incValue);if(!incMonth||val===0)return;setIncome(p=>[...p,{id:"inc-"+Date.now(),monthKey:incMonth,type:incType,value:val,desc:incDesc||incType}]);setIncValue("");setIncDesc("");setShowIncome(false);},[incMonth,incType,incValue,incDesc]);
  const removeIncome=useCallback((id)=>{setIncome(p=>p.filter(i=>i.id!==id));},[]);
  const addExpense=useCallback(()=>{const val=parseVal(expValue);if(!expMonth||val===0)return;const d=expDate?new Date(expDate+"T12:00:00"):new Date();const currency=expCurrency||"BRL";const isForeign=currency!=="BRL";setTxns(p=>[...p,{id:"man-"+Date.now(),date:d,description:expDesc||"Gasto manual",value:val,originalValue:val,currency,brlValue:isForeign?val:val,exchangeRate:isForeign?null:1,_needsRateUpdate:isForeign||undefined,monthKey:expMonth,category:expCat||"",confirmed:!!expCat,source:"Manual"}]);setExpValue("");setExpDesc("");setExpCat("");setExpDate("");setExpCurrency("BRL");setShowExpense(false);},[expMonth,expValue,expDesc,expCat,expDate,expCurrency]);
  const deleteTxn=useCallback((id)=>{pushTxnHistory();setTxns(p=>p.filter(t=>t.id!==id));},[pushTxnHistory]);
  const applyBulk=useCallback(()=>{if(!bulkAction||!bulkValue||selectedTxns.size===0)return;pushTxnHistory();
    // Collect non-BRL txns that need rate conversion when bulk-categorizing
    const needsConversion=[];
    setTxns(p=>p.map(t=>{if(!selectedTxns.has(t.id))return t;if(bulkAction==="category"){const pattern=extractLearnPattern(t.description);if(pattern)setLearnedPatterns(prev=>{if(prev.some(lp=>lp.pattern===pattern&&lp.category===bulkValue))return prev;return[...prev.filter(lp=>lp.pattern!==pattern),{pattern,category:bulkValue,createdAt:new Date().toISOString()}];});if(t.currency&&t.currency!=="BRL"&&(!t.exchangeRate||t.exchangeRate===1)&&t.monthKey)needsConversion.push({id:t.id,currency:t.currency,monthKey:t.monthKey});return{...t,category:bulkValue,confirmed:true};}if(bulkAction==="source")return{...t,source:bulkValue};if(bulkAction==="monthKey")return{...t,monthKey:bulkValue};if(bulkAction==="currency"){const cur=bulkValue;const u={...t,currency:cur,originalValue:t.originalValue||t.value};if(cur==="BRL"){u.brlValue=u.originalValue;u.exchangeRate=1;}else{u._needsRateUpdate=true;}return u;}return t;}));setSelectedTxns(new Set());setBulkAction(null);setBulkValue("");
    // Async: convert non-BRL transactions using monthly avg rate after bulk categorize
    if(needsConversion.length>0){(async()=>{const updates={};for(const nc of needsConversion){try{const rate=await getMonthlyAvgRate(nc.currency,nc.monthKey);if(rate>0&&rate!==1)updates[nc.id]={exchangeRate:rate};}catch(e){}}if(Object.keys(updates).length>0){setTxns(p=>p.map(t=>{const u=updates[t.id];if(!u)return t;return{...t,exchangeRate:u.exchangeRate,brlValue:Math.round((t.originalValue||t.value)*u.exchangeRate*100)/100,_needsRateUpdate:undefined};}));}})();}
  },[bulkAction,bulkValue,selectedTxns]);
  const deleteSelected=useCallback(()=>{if(selectedTxns.size===0)return;pushTxnHistory();setTxns(p=>p.filter(t=>!selectedTxns.has(t.id)));setSelectedTxns(new Set());},[selectedTxns,pushTxnHistory]);
  const fixAllData=useCallback(()=>{pushTxnHistory();
    let srcCount=0,mkCount=0;
    setTxns(p=>{
      // 1. Fix sources
      let fixed=p.map(t=>{const c=SOURCE_FIX[t.source];if(c){srcCount++;return{...t,source:c};}return t;});
      // 2. Fix base monthKeys from dates
      fixed=fixed.map(t=>{if(!t.date)return t;const mk=getMonthKey(t.date);if(mk!==t.monthKey){mkCount++;return{...t,monthKey:mk};}return t;});
      // 3. Normalize installment months (groups parcelas and adjusts)
      fixed=normalizeInstallmentMonths(fixed);
      return fixed;
    });
    return{srcCount:txns.filter(t=>SOURCE_FIX[t.source]).length,mkCount:txns.filter(t=>t.date&&getMonthKey(t.date)!==t.monthKey).length};
  },[txns]);

  // Budget handlers
  const openBudgetEditor=(mk)=>{
    const existing=budget[mk]||{};
    const seed=FC_SEED.find(s=>s.month===mk);
    const draft={};
    for(const k of [...BUDGET_INCOME_KEYS,...EXPENSE_KEYS]){draft[k]=existing[k]!=null?existing[k]:(seed?seed.O[k]||0:0);}
    setBudgetMonth(mk);setBudgetDraft(draft);setShowBudget(true);
  };
  const saveBudget=(applyForward)=>{
    if(!budgetMonth)return;
    setBudget(prev=>{
      const next={...prev};
      next[budgetMonth]={...next[budgetMonth],...budgetDraft};
      if(applyForward){
        const startSort=monthToSort(budgetMonth);
        const allMk=[...new Set([...fcMonths,...Object.keys(prev)])].filter(mk=>monthToSort(mk)>startSort);
        // Also add next 6 months if not present
        const[mn,yr]=budgetMonth.split("/");
        const mi=MONTH_NAMES.indexOf(mn);const y=2000+parseInt(yr);
        for(let i=1;i<=6;i++){const nm=(mi+i)%12;const ny=y+Math.floor((mi+i)/12);const mk=MONTH_NAMES[nm]+"/"+String(ny).slice(2);allMk.push(mk);}
        const uniqueMk=[...new Set(allMk)];
        for(const mk of uniqueMk){next[mk]={...(next[mk]||{}),...budgetDraft};}
      }
      return next;
    });
    setShowBudget(false);
  };

  // Investment handlers
  const saveInvestment=()=>{
    const val=parseVal(invDraft.value);if(!invDraft.monthKey||val===0)return;
    pushInvHistory();
    let rm=parseFloat(invDraft.rate)||0;
    if(invDraft.tipo==="fixa"){rm=invDraft.rateMode==="year"?Math.pow(1+rm/100,1/12)-1:rm/100;}
    if(editInvId){
      // Edit existing
      setInvestments(p=>p.map(inv=>inv.id!==editInvId?inv:{...inv,monthKey:invDraft.monthKey,value:val,tipo:invDraft.tipo,desc:invDraft.desc||invDraft.tipo,rateMonth:rm}));
    } else {
      // Create new
      setInvestments(p=>[...p,{id:"inv-"+Date.now(),monthKey:invDraft.monthKey,value:val,tipo:invDraft.tipo,desc:invDraft.desc||invDraft.tipo,rateMonth:rm,yields:{}}]);
    }
    setInvDraft({value:"",tipo:"fixa",desc:"",rate:"",rateMode:"year",monthKey:""});setEditInvId(null);setShowNewInv(false);
  };
  const openEditInv=(inv)=>{
    const ratePercent=inv.rateMonth*100;
    setInvDraft({value:String(inv.value),tipo:inv.tipo,desc:inv.desc,rate:inv.tipo==="fixa"?ratePercent.toFixed(4):"",rateMode:"month",monthKey:inv.monthKey});
    setEditInvId(inv.id);setShowNewInv(true);
  };
  const removeInvestment=(id)=>{pushInvHistory();setInvestments(p=>p.filter(i=>i.id!==id));};
  const setInvYield=(invId,mk,val)=>{
    pushInvHistory();setInvestments(p=>p.map(inv=>inv.id!==invId?inv:{...inv,yields:{...inv.yields,[mk]:parseFloat(val)||0}}));
  };

  // Compute investment timeline
  const invTimeline=useMemo(()=>{
    if(investments.length===0)return{months:[],rows:[]};
    // Collect all relevant months: from earliest investment to now+3
    const allMk=new Set();
    investments.forEach(inv=>allMk.add(inv.monthKey));
    const now=new Date();for(let i=0;i<=3;i++){const d=new Date(now);d.setMonth(d.getMonth()+i);allMk.add(getMonthKey(d));}
    fcMonths.forEach(mk=>allMk.add(mk));
    const months=[...allMk].sort((a,b)=>monthToSort(a)-monthToSort(b));

    const rows=investments.map(inv=>{
      const startIdx=months.indexOf(inv.monthKey);
      const cells=[];
      let balance=inv.value;let totalYield=0;
      for(let i=0;i<months.length;i++){
        const mk=months[i];
        if(i<startIdx||startIdx<0){cells.push({mk,active:false,balance:0,yieldMonth:0,totalYield:0});continue;}
        if(i===startIdx){cells.push({mk,active:true,balance:inv.value,yieldMonth:0,totalYield:0,isStart:true});continue;}
        let ym=0;
        if(inv.tipo==="fixa"){ym=balance*inv.rateMonth;}
        else{ym=inv.yields[mk]!=null?inv.yields[mk]:0;}
        balance+=ym;totalYield+=ym;
        cells.push({mk,active:true,balance,yieldMonth:ym,totalYield});
      }
      return{inv,cells,currentBalance:balance,totalYield};
    });
    return{months,rows};
  },[investments,fcMonths]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const allMonths=useMemo(()=>[...new Set(txns.map(t=>t.monthKey).filter(Boolean))].sort((a,b)=>monthToSort(a)-monthToSort(b)),[txns]);
  const uncat=txns.filter(t=>!t.category).length;
  const selData=selMonth?fcData.find(m=>m.month===selMonth):null;
  const nowMK=getMonthKey(new Date());

  const sortRows=(rows,{col,dir})=>{const m=dir==="asc"?1:-1;return[...rows].sort((a,b)=>{let va,vb;if(col==="date"){va=a.date?a.date.getTime():0;vb=b.date?b.date.getTime():0;}else if(col==="value"){va=a.value||0;vb=b.value||0;}else if(col==="description"||col==="desc"){va=(a.description||a.desc||"").toLowerCase();vb=(b.description||b.desc||"").toLowerCase();return va<vb?-m:va>vb?m:0;}else if(col==="category"){va=(a.category||"zzz").toLowerCase();vb=(b.category||"zzz").toLowerCase();return va<vb?-m:va>vb?m:0;}else if(col==="source"){va=(a.source||"").toLowerCase();vb=(b.source||"").toLowerCase();return va<vb?-m:va>vb?m:0;}else if(col==="monthKey"){va=a.monthKey?monthToSort(a.monthKey):0;vb=b.monthKey?monthToSort(b.monthKey):0;}else if(col==="type"){va=(a.type||"");vb=(b.type||"");return va<vb?-m:va>vb?m:0;}else{va=0;vb=0;}return(va-vb)*m;});};
  const matchSearch=(t,q)=>{if(!q)return true;const lq=q.toLowerCase();return(t.description||"").toLowerCase().includes(lq)||(t.desc||"").toLowerCase().includes(lq)||(t.source||"").toLowerCase().includes(lq)||(t.category||"").toLowerCase().includes(lq)||(t.type||"").toLowerCase().includes(lq)||(t.monthKey||"").toLowerCase().includes(lq);};
  const matchDateRange=(t,from,to)=>{if(!from&&!to)return true;if(!t.date)return false;const ts=t.date.getTime();if(from){const f=parseDate(from);if(f&&ts<f.getTime())return false;}if(to){const tt=parseDate(to);if(tt&&ts>tt.getTime()+86400000)return false;}return true;};
  const reviewFiltered=useMemo(()=>{let r=reviewShowAll?[...txns]:txns.filter(t=>!t.category);if(fMonth!=="all")r=r.filter(t=>t.monthKey===fMonth);if(reviewSearch)r=r.filter(t=>matchSearch(t,reviewSearch));if(reviewDateFrom||reviewDateTo)r=r.filter(t=>matchDateRange(t,reviewDateFrom,reviewDateTo));return sortRows(r,reviewSort);},[txns,fMonth,reviewSearch,reviewSort,reviewDateFrom,reviewDateTo,reviewShowAll]);

  // ─── Styles ────────────────────────────────────────────────────────────────
  const S={
    card:{background:C.card,border:"1px solid "+C.cardBorder,borderRadius:isMobile?12:16,padding:isMobile?14:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"},
    th:{padding:isMobile?"6px 8px":"10px 14px",textAlign:"left",borderBottom:"1px solid "+C.border,fontFamily:"'Space Mono',monospace",fontSize:isMobile?9:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px"},
    btn:{padding:isMobile?"6px 12px":"8px 18px",borderRadius:10,border:"none",cursor:"pointer",fontSize:isMobile?11:13,fontWeight:600,fontFamily:"inherit",transition:"all 0.15s"},
    input:{background:C.bg2,border:"1px solid "+C.cardBorder,borderRadius:10,padding:isMobile?"8px 10px":"10px 14px",color:C.t1,fontSize:isMobile?12:13,fontFamily:"inherit",width:"100%",outline:"none",transition:"border 0.15s"},
  };
  const SortTh=({label,col,sort,setSort,align})=>{const active=sort.col===col;return(<th onClick={()=>setSort(s=>s.col===col?{col,dir:s.dir==="asc"?"desc":"asc"}:{col,dir:"asc"})} style={{...S.th,textAlign:align||"left",cursor:"pointer",userSelect:"none",color:active?C.green:C.t4,padding:"8px 12px"}}>{label}{active?(sort.dir==="asc"?" ↑":" ↓"):""}</th>);};

  function TwoCol({oKey,eKey,bold,highlight}){return fcData.map(m=>{const ov=m.O[oKey]||0,ev=m.E[eKey]||0;const over=highlight&&ov>0&&ev>ov*1.15;return(<Fragment key={m.month}><td style={{padding:"6px 8px",textAlign:"right",fontSize:11,color:C.t4,borderBottom:"1px solid "+C.borderLight,fontFamily:"'Space Mono',monospace"}}>{fmt(ov)}</td><td style={{padding:"6px 8px",textAlign:"right",fontSize:11,color:over?C.red:ev!==0?C.t1:C.t4,borderBottom:"1px solid "+C.borderLight,fontFamily:"'Space Mono',monospace",fontWeight:bold||over?600:400}}>{fmt(ev)}</td></Fragment>);});}

  const entryRows=[["receitaTotal","Receita Total",true],["receitaMaria","Receita Maria"],["receitaRyo","Receita Ryo"],["hedge","Hedge"],["outrasReceitas","Outras Receitas"],["impostos","(-) Impostos"]];

  // All months for selectors (existing + current + future)
  const allMonthOptions=useMemo(()=>{const s=new Set([...fcMonths,nowMK]);for(let i=1;i<=12;i++){const d=new Date();d.setMonth(d.getMonth()+i);s.add(getMonthKey(d));}return[...s].sort((a,b)=>monthToSort(a)-monthToSort(b));},[fcMonths,nowMK]);

  // Budget row labels
  const budgetLabels={receitaMaria:"Receita Maria",receitaRyo:"Receita Ryo",hedge:"Hedge",outrasReceitas:"Outras Receitas",impostos:"Impostos",investimento:"Investimento",aluguel:"Aluguel",carro:"Carro",saude:"Saúde",casa:"Casa",supermercado:"Supermercado",marmitas:"Marmitas",lazer:"Lazer",viagens:"Viagens",tecnologia:"Tecnologia",gastosMaria:"Gastos Maria",gastosRyo:"Gastos Ryo",casamento:"Casamento",outros:"Outros (Saídas)"};

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.t1,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"/>

      {/* Loading screen */}
      {!loaded&&(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:16}}>
        <RichLifeLogo size={64}/>
        <div style={{fontSize:14,color:C.t3}}>Carregando seus dados...</div>
        <div style={{width:16,height:16,border:"2px solid "+C.borderLight,borderTopColor:C.green,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      </div>)}

      {loaded&&<>
      {/* HEADER */}
      <header style={{padding:isMobile?"10px 14px":"16px 28px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",backdropFilter:"blur(20px)",position:"sticky",top:0,zIndex:50,background:"rgba(255,255,255,0.92)",flexWrap:isMobile?"wrap":"nowrap",gap:isMobile?6:0}}>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:14}}>
          <RichLifeLogo size={isMobile?28:38}/>
          <div><div style={{fontWeight:700,fontSize:isMobile?14:18,letterSpacing:"-0.3px",color:C.t1}}>Rich Life</div>{!isMobile&&<div style={{fontSize:10,color:C.t4,fontFamily:"'Space Mono',monospace",letterSpacing:"0.5px"}}>MARIA & RYO</div>}</div>
          {saveStatus&&<div style={{fontSize:10,color:saveStatus.includes("✓")||saveStatus.includes("☁")?C.green:C.t4,fontFamily:"'Space Mono',monospace",marginLeft:8,opacity:0.7}}>{saveStatus}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?2:8,overflowX:isMobile?"auto":"visible",width:isMobile?"100%":"auto",WebkitOverflowScrolling:"touch"}}>
          <nav style={{display:"flex",gap:isMobile?2:4,background:C.bg2,borderRadius:12,padding:3,flexShrink:0}}>
            {[["dashboard","Dashboard"],["upload","Upload"],["review","Revisão"+(uncat>0?" ("+uncat+")":"")],["categories",isMobile?"Categ.":"Categorias"],["investments",isMobile?"Invest.":"Investimentos"]].map(([id,lb])=>(
              <button key={id} onClick={()=>setView(id)} style={{...S.btn,padding:isMobile?"6px 10px":"8px 16px",fontWeight:500,fontSize:isMobile?10:12,background:view===id?C.greenBg:"transparent",color:view===id?C.green:C.t3,borderRadius:10,whiteSpace:"nowrap"}}>{lb}</button>
            ))}
          </nav>
          {!isMobile&&<button onClick={handleResetData} style={{background:"none",border:"none",color:C.t4,cursor:"pointer",fontSize:11,padding:"6px 10px",fontFamily:"'Space Mono',monospace"}} title="Resetar todos os dados">↺</button>}
        </div>
      </header>

      <main style={{padding:isMobile?"14px":"28px 28px",maxWidth:1440,margin:"0 auto"}}>

        {/* ═══ DASHBOARD ═══ */}
        {view==="dashboard"&&(<div>
          {/* Main chart: Receita / Gastos / Saldo */}
          <div style={{...S.card,marginBottom:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:18,fontWeight:700}}>Visão Mensal</div>
              <div style={{display:"flex",gap:isMobile?8:16,fontSize:isMobile?10:12,color:C.t3,flexWrap:"wrap"}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.green}}/> Receita</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.red}}/> Gastos</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.purple}}/> Invest.</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.gold}}/> Saldo+</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.orange}}/> Saldo−</span>
              </div>
            </div>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",marginLeft:-24,marginRight:-24,paddingLeft:24,paddingRight:24}}>
              <div style={{width:Math.max(dashChart.length*120,600),height:isMobile?220:300}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashChart} barGap={2} onClick={e=>{if(e&&e.activeLabel)setSelMonth(e.activeLabel)}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} vertical={false}/>
                    <XAxis dataKey="month" tick={({x,y,payload})=>{const mk=payload.value;const done=completedMonths[mk];return(<g transform={`translate(${x},${y})`}><text x={0} y={0} dy={14} textAnchor="middle" fill={done?C.green:C.t3} fontSize={11} fontFamily="Space Mono">{mk}{done?" ✓":""}</text></g>);}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.t4,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmtK}/>
                    <Tooltip cursor={{fill:"rgba(0,0,0,0.02)"}} content={({active,payload,label})=>{if(!active||!payload)return null;return(<div style={{background:C.card,border:"1px solid "+C.cardBorder,borderRadius:12,padding:"12px 16px",fontSize:12,color:C.t1,boxShadow:"0 8px 32px rgba(0,0,0,0.08)"}}><div style={{fontWeight:600,marginBottom:8,fontFamily:"'Space Mono',monospace",fontSize:11,color:C.t3}}>{label}</div>{payload.map((entry,i)=>{let color=entry.color;if(entry.dataKey==="saldo")color=entry.value>=0?C.gold:C.orange;return(<div key={i} style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:"3px 0"}}><span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:2,background:color,flexShrink:0}}/><span style={{color}}>{entry.name}</span></span><span style={{fontFamily:"'Space Mono',monospace",fontWeight:600,color}}>{fmt(entry.value)}</span></div>);})}</div>);}}/>
                    <ReferenceLine y={0} stroke={C.border}/>
                    <Bar dataKey="receita" name="Receita" fill={C.green} radius={[4,4,0,0]} maxBarSize={28}/>
                    <Bar dataKey="gastos" name="Gastos" fill={C.red} radius={[4,4,0,0]} maxBarSize={28}/>
                    <Bar dataKey="investimento" name="Investimento" fill={C.purple} radius={[4,4,0,0]} maxBarSize={28}/>
                    <Bar dataKey="saldo" name="Saldo" radius={[4,4,0,0]} maxBarSize={28}>{dashChart.map((d,i)=><Cell key={i} fill={d.saldo>=0?C.gold:C.orange}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{textAlign:"center",fontSize:11,color:C.t4,marginTop:8}}>← Role para ver todos os meses · Clique num mês para detalhes →</div>
          </div>

          {/* ── Pie Chart: Expenses by Category ── */}
          <div style={{...S.card,marginBottom:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:isMobile?"flex-start":"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div style={{fontSize:isMobile?16:18,fontWeight:700}}>Gastos por Categoria</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:10,color:C.t3,marginRight:4}}>Meses:</span>
                {allMonthOptions.map(mk=>{const sel=pieMonths.includes(mk);const isCur=pieMonths.length===0&&mk===nowMK;return(
                  <button key={mk} onClick={()=>setPieMonths(prev=>prev.includes(mk)?prev.filter(m=>m!==mk):[...prev,mk])} style={{padding:"3px 7px",borderRadius:6,fontSize:9,fontFamily:"'Space Mono',monospace",border:"1px solid "+(sel||isCur?"rgba(42,157,143,0.4)":C.cardBorder),background:sel||isCur?C.greenBg:"transparent",color:sel||isCur?C.green:C.t4,cursor:"pointer",fontWeight:sel||isCur?600:400}}>{mk}</button>
                );})}
                {pieMonths.length>0&&<button onClick={()=>setPieMonths([])} style={{...S.btn,padding:"3px 7px",fontSize:9,background:C.bg2,color:C.t4}}>Limpar</button>}
              </div>
            </div>
            {pieData.length===0?(<div style={{textAlign:"center",padding:isMobile?20:40,fontSize:13,color:C.t4}}>Nenhum gasto categorizado no período.</div>):(
              <div style={{display:"flex",gap:isMobile?12:24,alignItems:isMobile?"stretch":"center",flexDirection:isMobile?"column":"row"}}>
                <div style={{flex:isMobile?"none":"0 0 280px",height:isMobile?240:280,minWidth:0}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={isMobile?90:110} innerRadius={isMobile?45:55} dataKey="value" stroke="none" paddingAngle={1}>
                        {pieData.map((entry,i)=><Cell key={i} fill={entry.color}/>)}
                      </Pie>
                      <Tooltip content={({active,payload})=>{if(!active||!payload||!payload[0])return null;const d=payload[0].payload;return(
                        <div style={{background:C.card,border:"1px solid "+C.cardBorder,borderRadius:10,padding:"8px 12px",fontSize:12,boxShadow:"0 8px 32px rgba(0,0,0,0.08)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{width:8,height:8,borderRadius:2,background:d.color}}/><span style={{fontWeight:600}}>{d.name}</span></div>
                          <div style={{fontFamily:"'Space Mono',monospace"}}>{fmt(d.value)} ({d.pct}%)</div>
                        </div>);}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:isMobile?11:12}}>
                    <thead><tr><th style={{...S.th,padding:"6px 8px"}}>Categoria</th><th style={{...S.th,padding:"6px 8px",textAlign:"right"}}>Valor</th><th style={{...S.th,padding:"6px 8px",textAlign:"right"}}>%</th></tr></thead>
                    <tbody>
                      {pieData.map(d=>(<tr key={d.name} style={{borderBottom:"1px solid "+C.borderLight}}>
                        <td style={{padding:"5px 8px"}}><span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:2,background:d.color,flexShrink:0}}/>{d.name}</span></td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontWeight:600,fontSize:11}}>{fmt(d.value)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:11,color:C.t3}}>{d.pct}%</td>
                      </tr>))}
                      <tr style={{borderTop:"2px solid "+C.border}}><td style={{padding:"6px 8px",fontWeight:700}}>Total</td><td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontWeight:700}}>{fmt(pieTotalValue)}</td><td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:11,color:C.t3}}>100%</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          {/* Month detail */}
          {selData&&(()=>{
            const rawTxns=txns.filter(t=>t.monthKey===selMonth);
            const rawInc=income.filter(i=>i.monthKey===selMonth);
            let txnF=rawTxns;if(detailSearch)txnF=txnF.filter(t=>matchSearch(t,detailSearch));if(detailCatFilter!=="all")txnF=txnF.filter(t=>(t.category||"—")===detailCatFilter);if(detailDateFrom||detailDateTo)txnF=txnF.filter(t=>matchDateRange(t,detailDateFrom,detailDateTo));
            const fTxns=sortRows(txnF,detailSort);
            let incF=rawInc;if(incSearch)incF=incF.filter(i=>matchSearch(i,incSearch));if(incTypeFilter!=="all")incF=incF.filter(i=>i.type===incTypeFilter);
            const fInc=sortRows(incF,incSort);
            const monthCats=[...new Set(rawTxns.map(t=>t.category||"—"))].sort();
            const totalGastos=rawTxns.filter(t=>t.category&&t.category!=="Reembolso").reduce((s,t)=>s+(t.brlValue!=null?t.brlValue:t.value),0);
            const totalReembolso=rawTxns.filter(t=>t.category==="Reembolso").reduce((s,t)=>s+(t.brlValue!=null?t.brlValue:t.value),0);
            const totalReceita=rawInc.reduce((s,i)=>s+i.value,0);
            const cellInput=()=>(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11,width:"100%"}}/>);
            return(
            <div style={{...S.card,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <div>
                  <div style={{fontSize:20,fontWeight:700}}>Detalhamento — {selMonth}</div>
                  <div style={{display:"flex",gap:20,fontSize:12,color:C.t3,marginTop:6,flexWrap:"wrap"}}>
                    <span>Receitas: <span style={{color:"#2A9D8F",fontWeight:600}}>{fmt(totalReceita)}</span></span>
                    <span>Saídas: <span style={{color:"#E8575A",fontWeight:600}}>{fmt(totalGastos)}</span></span>
                    {totalReembolso>0&&<span>Reembolsos: <span style={{color:"#4CAF50",fontWeight:600}}>{fmt(totalReembolso)}</span></span>}
                    <span style={{color:C.t4}}>{rawTxns.length} transações · {rawInc.length} receitas</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {completedMonths[selMonth]&&<span style={{fontSize:11,color:C.green,fontFamily:"'Space Mono',monospace",display:"flex",alignItems:"center",gap:4}}>🔒 Mês travado</span>}
                  {!completedMonths[selMonth]&&<>
                    <button onClick={()=>openBudgetEditor(selMonth)} style={{...S.btn,background:C.purpleBg,color:"#6C63FF",border:"1px solid rgba(108,99,255,0.25)",fontSize:12,padding:"6px 14px"}}>✎ Orçado</button>
                    <button onClick={()=>{setShowIncome(true);setIncMonth(selMonth)}} style={{...S.btn,background:C.greenBg,color:"#2A9D8F",border:"1px solid rgba(42,157,143,0.25)",fontSize:12,padding:"6px 14px"}}>+ Receita</button>
                  </>}
                  <button onClick={()=>setSelMonth(null)} style={{...S.btn,background:C.bg2,color:C.t3,padding:"6px 14px",fontSize:12}}>✕</button>
                </div>
              </div>

              {/* Income table */}
              {rawInc.length>0&&(<div style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#2A9D8F",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:"'Space Mono',monospace"}}>Receitas</div>
                  <input value={incSearch} onChange={e=>setIncSearch(e.target.value)} placeholder="Buscar..." style={{...S.input,width:130,padding:"4px 10px",fontSize:11}}/>
                  <select value={incTypeFilter} onChange={e=>setIncTypeFilter(e.target.value)} style={{...S.input,width:"auto",padding:"4px 10px",fontSize:11}}><option value="all">Todos</option><option value="maria">Maria</option><option value="ryo">Ryo</option><option value="outros">Outros</option></select>
                  <div style={{marginLeft:"auto",fontSize:10,color:C.t4,fontFamily:"'Space Mono',monospace"}}>{fInc.length}/{rawInc.length}</div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(42,157,143,0.12)"}}>
                    <SortTh label="Tipo" col="type" sort={incSort} setSort={setIncSort}/>
                    <SortTh label="Descrição" col="desc" sort={incSort} setSort={setIncSort}/>
                    <SortTh label="Valor" col="value" sort={incSort} setSort={setIncSort} align="right"/>
                    <th style={{...S.th,width:36}}/>
                  </tr></thead>
                  <tbody>{fInc.map(inc=>(<tr key={inc.id} style={{borderBottom:"1px solid "+C.borderLight}}>
                    <td style={{padding:"8px 12px",width:110}}>{isEditing(inc.id,"type","inc")?(<select autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} style={{...S.input,padding:"4px 8px",fontSize:11}}><option value="maria">Maria</option><option value="ryo">Ryo</option><option value="outros">Outros</option></select>):(<button onClick={()=>startEdit(inc.id,"type","inc",inc.type)} style={{background:inc.type==="maria"?"rgba(199,125,186,0.12)":inc.type==="ryo"?"rgba(91,141,239,0.12)":"rgba(42,157,143,0.12)",border:"none",borderRadius:8,padding:"4px 12px",color:inc.type==="maria"?"#C77DBA":inc.type==="ryo"?"#5B8DEF":"#2A9D8F",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{inc.type==="maria"?"Maria":inc.type==="ryo"?"Ryo":"Outros"}</button>)}</td>
                    <td style={{padding:"8px 12px"}}>{isEditing(inc.id,"desc","inc")?cellInput():(<span onClick={()=>startEdit(inc.id,"desc","inc",inc.desc||"")} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border}}>{inc.desc||"—"}</span>)}</td>
                    <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontWeight:600}}>{isEditing(inc.id,"value","inc")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11,textAlign:"right",width:120}}/>):(<span onClick={()=>startEdit(inc.id,"value","inc",String(inc.value))} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border}}>{fmt(inc.value)}</span>)}</td>
                    <td style={{padding:"8px 12px",width:36,textAlign:"center"}}><button onClick={()=>removeIncome(inc.id)} style={{background:"none",border:"none",color:"rgba(232,87,90,0.4)",cursor:"pointer",fontSize:14}}>×</button></td>
                  </tr>))}</tbody>
                </table>
              </div>)}

              {/* Expenses table */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#E8575A",textTransform:"uppercase",letterSpacing:"0.5px",fontFamily:"'Space Mono',monospace"}}>Saídas ({rawTxns.length})</div>
                <input value={detailSearch} onChange={e=>setDetailSearch(e.target.value)} placeholder="Buscar..." style={{...S.input,width:130,padding:"4px 10px",fontSize:11}}/>
                <select value={detailCatFilter} onChange={e=>setDetailCatFilter(e.target.value)} style={{...S.input,width:"auto",padding:"4px 10px",fontSize:11}}><option value="all">Todas</option>{monthCats.map(c=><option key={c} value={c}>{c}</option>)}</select>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.t3}}>
                  <span>De</span><input type="date" value={detailDateFrom} onChange={e=>setDetailDateFrom(e.target.value)} style={{...S.input,width:"auto",padding:"3px 6px",fontSize:10}}/>
                  <span>Até</span><input type="date" value={detailDateTo} onChange={e=>setDetailDateTo(e.target.value)} style={{...S.input,width:"auto",padding:"3px 6px",fontSize:10}}/>
                </div>
                <div style={{marginLeft:"auto",fontSize:10,color:C.t4,fontFamily:"'Space Mono',monospace"}}>{fTxns.length}/{rawTxns.length}</div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(232,87,90,0.12)"}}>
                    <SortTh label="Data" col="date" sort={detailSort} setSort={setDetailSort}/>
                    <SortTh label="Descrição" col="description" sort={detailSort} setSort={setDetailSort}/>
                    <SortTh label="Valor" col="value" sort={detailSort} setSort={setDetailSort} align="right"/>
                    <SortTh label="Categoria" col="category" sort={detailSort} setSort={setDetailSort}/>
                    <SortTh label="Fonte" col="source" sort={detailSort} setSort={setDetailSort}/>
                    <th style={{...S.th,width:36}}/>
                  </tr></thead>
                  <tbody>{fTxns.map(t=>{const isReemb=t.category==="Reembolso";return(<tr key={t.id} style={{borderBottom:"1px solid "+C.borderLight,background:isReemb?"rgba(76,175,80,0.03)":!t.category?"rgba(232,87,90,0.025)":"transparent"}}>
                    <td style={{padding:"8px 12px",whiteSpace:"nowrap",width:100}}>{isEditing(t.id,"date","txn")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} placeholder="DD/MM/YYYY" style={{...S.input,padding:"4px 8px",fontSize:11,width:100}}/>):(<span onClick={()=>startEdit(t.id,"date","txn",t.date?t.date.toLocaleDateString("pt-BR"):"")} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border,color:C.t3,fontFamily:"'Space Mono',monospace",fontSize:11}}>{t.date?t.date.toLocaleDateString("pt-BR"):"—"}</span>)}</td>
                    <td style={{padding:"8px 12px",maxWidth:260}}>{isEditing(t.id,"description","txn")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11,width:"100%"}}/>):(<span onClick={()=>startEdit(t.id,"description","txn",t.description)} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.description}>{t.description}</span>)}</td>
                    <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontWeight:600,width:140,textDecoration:isReemb?"line-through":"none",color:isReemb?"#4CAF50":C.t1}}>{isEditing(t.id,"value","txn")?(<div style={{display:"flex",gap:4,alignItems:"center"}}><input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11,textAlign:"right",width:90}}/><select value={editCurrency} onChange={e=>setEditCurrency(e.target.value)} style={{...S.input,padding:"4px 4px",fontSize:10,width:60}}>{SUPPORTED_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select><button onClick={commitEdit} style={{background:C.green,color:"#fff",border:"none",borderRadius:6,padding:"4px 6px",fontSize:10,cursor:"pointer"}}>OK</button></div>):(<span onClick={()=>{startEdit(t.id,"value","txn",String(t.originalValue||t.value));setEditCurrency(t.currency||"BRL");}} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border}}>{t.currency&&t.currency!=="BRL"?(<>{fmtCurrency(t.originalValue,t.currency)}<div style={{fontSize:10,color:C.t4,fontWeight:400}}>{fmt(t.brlValue)}</div></>):fmt(t.brlValue!=null?t.brlValue:t.value)}</span>)}</td>
                    <td style={{padding:"8px 12px",width:130}}>{isEditing(t.id,"category","txn")?(<select autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={()=>{updateCat(t.id,editVal);cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11}}><option value="">—</option>{catNames.map(c=><option key={c} value={c}>{c}</option>)}</select>):(<button onClick={()=>startEdit(t.id,"category","txn",t.category||"")} style={{background:t.category?((catColorMap[t.category]||"#999")+"15"):"rgba(232,87,90,0.08)",border:"1px solid "+(t.category?((catColorMap[t.category]||"#999")+"30"):"rgba(232,87,90,0.15)"),borderRadius:8,padding:"3px 10px",color:t.category?(catColorMap[t.category]||"#999"):"#E8575A",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:500,whiteSpace:"nowrap"}}>{t.category||"⚠"}</button>)}</td>
                    <td style={{padding:"8px 12px",fontSize:11,width:150}}>{isEditing(t.id,"source","txn")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11}}/>):(<span onClick={()=>startEdit(t.id,"source","txn",t.source||"")} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border,color:C.t3,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.source}>{t.source||"—"}</span>)}</td>
                    <td style={{padding:"8px 12px",width:36,textAlign:"center"}}><button onClick={()=>setTxns(p=>p.filter(x=>x.id!==t.id))} style={{background:"none",border:"none",color:"rgba(232,87,90,0.35)",cursor:"pointer",fontSize:14}} title="Remover">×</button></td>
                  </tr>)})}</tbody>
                </table>
              </div>
              {rawTxns.length===0&&<div style={{padding:24,textAlign:"center",fontSize:13,color:C.t4}}>Nenhuma transação neste mês. Faça upload na aba Upload.</div>}
            </div>);})()}

          {/* FC Table */}
          <div style={{...S.card,overflow:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:700}}>Fluxo de Caixa</div>
              <button onClick={()=>{setBudgetMonth("");setShowBudget(true);}} style={{...S.btn,background:C.purpleBg,color:"#6C63FF",border:"1px solid rgba(108,99,255,0.2)",fontSize:12,padding:"6px 14px"}}>✎ Editar Orçado</button>
            </div>
            <div ref={fcTableRef} style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr>
                    <th style={{...S.th,position:"sticky",left:0,background:C.card,zIndex:3,minWidth:150,boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}> </th>
                    {fcData.map(m=><th key={m.month} colSpan={2} style={{...S.th,textAlign:"center",padding:"8px 6px 4px",verticalAlign:"top"}}>
                      <button onClick={()=>setSelMonth(selMonth===m.month?null:m.month)} style={{background:selMonth===m.month?C.greenBg:"rgba(0,0,0,0.03)",border:"1px solid "+(selMonth===m.month?"rgba(42,157,143,0.3)":"rgba(0,0,0,0.06)"),borderRadius:8,padding:"4px 10px",color:selMonth===m.month?C.green:C.t2,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Space Mono',monospace",letterSpacing:"0.3px",transition:"all 0.15s"}}>{m.month}</button>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:5}}>
                        <div onClick={()=>setCompletedMonths(p=>({...p,[m.month]:!p[m.month]}))} title={completedMonths[m.month]?"Mês travado — clique para destravar":"Clique para travar o mês"} style={{width:28,height:14,borderRadius:7,background:completedMonths[m.month]?C.green:"#DEE2E6",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                          <div style={{width:10,height:10,borderRadius:5,background:"#fff",position:"absolute",top:2,left:completedMonths[m.month]?16:2,transition:"left 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.15)"}}/>
                        </div>
                        <span style={{fontSize:8,color:completedMonths[m.month]?C.green:C.t4}}>{completedMonths[m.month]?"🔒":""}</span>
                      </div>
                    </th>)}
                  </tr>
                  <tr>
                    <th style={{position:"sticky",left:0,background:C.card,zIndex:3,padding:6,boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}> </th>
                    {fcData.map(m=>(<Fragment key={m.month+"sub"}><th style={{padding:"4px 8px",textAlign:"right",borderBottom:"1px solid "+C.borderLight,fontSize:9,color:C.t4,fontWeight:400}}>Orçado</th><th style={{padding:"4px 8px",textAlign:"right",borderBottom:"1px solid "+C.borderLight,fontSize:9,color:C.t4,fontWeight:400}}>Exec.</th></Fragment>))}
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={1+fcData.length*2} style={{padding:"12px 14px 4px",fontSize:10,fontWeight:700,color:"#2A9D8F",textTransform:"uppercase",letterSpacing:"1px",fontFamily:"'Space Mono',monospace"}}>Entradas</td></tr>
                  {entryRows.map(([k,label,bold])=>(<tr key={k} style={{background:bold?C.greenBg:"transparent"}}><td style={{position:"sticky",left:0,background:bold?"#EBF5F3":C.card,zIndex:2,padding:"6px 14px",fontWeight:bold?700:400,fontSize:bold?12:11,color:bold?C.t1:C.t2,borderBottom:"1px solid "+C.borderLight,whiteSpace:"nowrap",boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}>{label}</td><TwoCol oKey={k} eKey={k} bold={bold}/></tr>))}
                  <tr><td colSpan={1+fcData.length*2} style={{padding:"12px 14px 4px",fontSize:10,fontWeight:700,color:"#6C63FF",textTransform:"uppercase",letterSpacing:"1px",fontFamily:"'Space Mono',monospace"}}>Investimento</td></tr>
                  <tr><td style={{position:"sticky",left:0,background:C.card,zIndex:2,padding:"6px 14px",fontSize:11,color:C.t2,borderBottom:"1px solid "+C.borderLight,boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}>Investimento</td><TwoCol oKey="investimento" eKey="investimento"/></tr>
                  <tr><td colSpan={1+fcData.length*2} style={{padding:"12px 14px 4px",fontSize:10,fontWeight:700,color:"#E8575A",textTransform:"uppercase",letterSpacing:"1px",fontFamily:"'Space Mono',monospace"}}>Saídas</td></tr>
                  {catNames.filter(c=>KEY_MAP[c]).map(cat=>(<tr key={cat}><td style={{position:"sticky",left:0,background:C.card,zIndex:2,padding:"6px 14px",fontSize:11,color:C.t2,borderBottom:"1px solid "+C.borderLight,whiteSpace:"nowrap",boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}><span style={{display:"inline-block",width:6,height:6,borderRadius:2,background:catColorMap[cat]||"#999",marginRight:6,verticalAlign:"middle"}}/>{cat}</td><TwoCol oKey={KEY_MAP[cat]} eKey={KEY_MAP[cat]} highlight/></tr>))}
                  <tr style={{background:C.redBg}}><td style={{position:"sticky",left:0,background:"#FDF0F0",zIndex:2,padding:"8px 14px",fontWeight:700,fontSize:12,borderTop:"1px solid "+C.border,boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}>Total Saídas</td><TwoCol oKey="totalSaidas" eKey="totalSaidas" bold/></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>)}

        {/* ═══ UPLOAD ═══ */}
        {view==="upload"&&(<div>
          <div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:24,fontWeight:700,marginBottom:8}}>Upload de Faturas e Extratos</div><div style={{fontSize:14,color:C.t3,maxWidth:500,margin:"0 auto"}}>A IA extrai e categoriza automaticamente.</div></div>
          <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(Array.from(e.dataTransfer.files))}} onClick={()=>fileRef.current?.click()} style={{border:"2px dashed "+(drag?C.green:C.border),borderRadius:20,padding:isMobile?"30px 20px":"60px 40px",textAlign:"center",cursor:"pointer",background:drag?C.greenBg:C.bg2,marginBottom:32,transition:"all 0.2s"}}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf" multiple style={{display:"none"}} onChange={e=>handleFiles(Array.from(e.target.files))}/>
            <div style={{fontSize:40,marginBottom:12,opacity:0.25}}>↑</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>{drag?"Solte aqui":"Arraste arquivos ou clique"}</div>
            <div style={{fontSize:12,color:C.t4}}>.xlsx, .xls, .csv, .pdf</div>
          </div>
          {uploadStatus&&(<div style={{...S.card,marginBottom:16,padding:"16px 20px",display:"flex",alignItems:"center",gap:12,border:uploadStatus.loading?"1px solid rgba(108,99,255,0.25)":"1px solid rgba(42,157,143,0.25)",background:uploadStatus.loading?"rgba(108,99,255,0.04)":"rgba(42,157,143,0.04)"}}>
            {uploadStatus.loading&&<div style={{width:16,height:16,border:"2px solid rgba(108,99,255,0.25)",borderTopColor:"#6C63FF",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>}
            {!uploadStatus.loading&&<span style={{color:"#2A9D8F",fontSize:15}}>✓</span>}
            <span style={{fontSize:13,color:uploadStatus.loading?"#6C63FF":"#2A9D8F"}}>{uploadStatus.msg}</span>
          </div>)}
          {files.length>0&&(<div style={S.card}><div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Arquivos processados</div>{files.map((f,i)=>{const cnt=txns.filter(t=>t.source?.includes(f)||t.id.startsWith(f)).length;return(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,background:C.greenBg,marginBottom:6}}><span style={{color:"#2A9D8F"}}>✓</span><span style={{fontSize:12,color:C.t2}}>{f}</span><span style={{fontSize:10,color:C.t4,marginLeft:"auto",fontFamily:"'Space Mono',monospace"}}>{cnt} txns</span><button onClick={()=>{if(confirm("Deletar \""+f+"\" e suas "+cnt+" transações?")){setTxns(p=>p.filter(t=>!(t.source?.includes(f)||t.id.startsWith(f))));setFiles(p=>p.filter((_,j)=>j!==i));}}} style={{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:14,padding:"2px 6px",borderRadius:6,lineHeight:1}} title="Deletar arquivo e transações">✕</button></div>);})}<button onClick={()=>setView("review")} style={{...S.btn,marginTop:12,background:"#2A9D8F",color:"#fff"}}>Revisar →</button></div>)}
        </div>)}

        {/* ═══ CATEGORIES ═══ */}
        {view==="categories"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <div><div style={{fontSize:isMobile?16:20,fontWeight:700}}>Categorias</div><div style={{fontSize:12,color:C.t3,marginTop:4}}>A IA usa a descrição para classificar transações.{learnedPatterns.length>0&&<span style={{fontFamily:"'Space Mono',monospace",color:C.green,marginLeft:8}}>{learnedPatterns.length} padrões aprendidos</span>}</div></div>
            <div style={{display:"flex",gap:8}}>
              {uncat>0&&<button onClick={handleAiRecat} disabled={aiLoading} style={{...S.btn,background:C.purpleBg,color:"#6C63FF",border:"1px solid rgba(108,99,255,0.2)",opacity:aiLoading?0.5:1}}>{aiLoading?"⏳ ...":"✦ IA: Pendentes"}</button>}
              <button onClick={()=>{setShowNewCat(true);setNewCatColor(PALETTE[categories.length%PALETTE.length])}} style={{...S.btn,background:"#2A9D8F",color:"#fff"}}>+ Nova</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
            {categories.map(cat=>{const count=txns.filter(t=>t.category===cat.name).length;const total=txns.filter(t=>t.category===cat.name).reduce((s,t)=>s+(t.brlValue!=null?t.brlValue:t.value),0);return(
              <div key={cat.name} style={{...S.card,padding:18,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,width:4,height:"100%",background:cat.color,borderRadius:"0 4px 4px 0"}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:10,height:10,borderRadius:4,background:cat.color}}/><div style={{fontSize:14,fontWeight:700}}>{cat.name}</div></div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{setEditCat(cat.name);setEditCatDesc(cat.desc)}} style={{background:C.bg3,border:"none",borderRadius:6,padding:"4px 8px",color:C.t3,cursor:"pointer",fontSize:11}}>✎</button>
                    <button onClick={()=>setDeleteCat(cat.name)} style={{background:C.redBg,border:"none",borderRadius:6,padding:"4px 8px",color:"#E8575A",cursor:"pointer",fontSize:11}}>✕</button>
                  </div>
                </div>
                <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginBottom:10,minHeight:32}}>{cat.desc}</div>
                <div style={{display:"flex",gap:14,fontSize:10,fontFamily:"'Space Mono',monospace",color:C.t4}}>{count>0&&<span>{count} txns</span>}{total>0&&<span>{fmt(total)}</span>}</div>
              </div>);})}
          </div>
        </div>)}

        {/* ═══ REVIEW ═══ */}
        {view==="review"&&(<div style={{maxHeight:"calc(100vh - 90px)",overflowY:"auto",position:"relative"}}>
          <div style={{display:"flex",gap:10,marginBottom:0,flexWrap:"wrap",alignItems:"center",position:"sticky",top:0,zIndex:12,background:C.bg,paddingBottom:12,paddingTop:4}}>
            <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:"1px solid "+C.cardBorder}}>
              <button onClick={()=>{setReviewShowAll(false);setSelectedTxns(new Set());}} style={{padding:"6px 14px",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",background:!reviewShowAll?"#2A9D8F":"transparent",color:!reviewShowAll?"#fff":C.t3,fontFamily:"inherit"}}>Pendentes ({uncat})</button>
              <button onClick={()=>{setReviewShowAll(true);setSelectedTxns(new Set());}} style={{padding:"6px 14px",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",background:reviewShowAll?"#6C63FF":"transparent",color:reviewShowAll?"#fff":C.t3,fontFamily:"inherit"}}>Todos ({txns.length})</button>
            </div>
            <select value={fMonth} onChange={e=>setFMonth(e.target.value)} style={{...S.input,width:"auto",padding:"6px 12px",fontSize:12}}><option value="all">Todos meses</option>{allMonths.map(m=><option key={m} value={m}>{m}</option>)}</select>
            <input value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)} placeholder="Buscar..." style={{...S.input,width:150,padding:"6px 12px",fontSize:12}}/>
            <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.t3}}>
              <span>De</span><input type="date" value={reviewDateFrom} onChange={e=>setReviewDateFrom(e.target.value)} style={{...S.input,width:"auto",padding:"4px 8px",fontSize:11}}/>
              <span>Até</span><input type="date" value={reviewDateTo} onChange={e=>setReviewDateTo(e.target.value)} style={{...S.input,width:"auto",padding:"4px 8px",fontSize:11}}/>
            </div>
            {!reviewShowAll&&uncat>0&&<button onClick={handleAiRecat} disabled={aiLoading} style={{...S.btn,background:C.purpleBg,color:"#6C63FF",border:"1px solid rgba(108,99,255,0.2)",fontSize:12,padding:"6px 14px",opacity:aiLoading?0.5:1}}>{aiLoading?"⏳ ...":"✦ IA"}</button>}
            <button onClick={()=>{setExpMonth(nowMK);setShowExpense(true);}} style={{...S.btn,background:C.greenBg,color:"#2A9D8F",border:"1px solid rgba(42,157,143,0.25)",fontSize:12,padding:"6px 14px"}}>+ Gasto</button>
            <button onClick={()=>{const r=fixAllData();setUploadStatus({loading:false,msg:"Corrigido! "+r.mkCount+" mês(es), "+r.srcCount+" fonte(s)."});setTimeout(()=>setUploadStatus(null),4000);}} style={{...S.btn,background:C.bg2,color:C.t3,border:"1px solid "+C.cardBorder,fontSize:11,padding:"5px 12px"}} title="Recalcula meses, corrige fontes e normaliza parcelas">↻ Corrigir dados</button>
            <button onClick={undoTxns} disabled={txnHistory.length===0} style={{...S.btn,background:C.bg2,color:txnHistory.length>0?C.t2:C.t4,border:"1px solid "+C.cardBorder,fontSize:11,padding:"5px 10px",opacity:txnHistory.length>0?1:0.4}} title="Desfazer (Ctrl+Z)">↩</button>
            <button onClick={redoTxns} disabled={txnFuture.length===0} style={{...S.btn,background:C.bg2,color:txnFuture.length>0?C.t2:C.t4,border:"1px solid "+C.cardBorder,fontSize:11,padding:"5px 10px",opacity:txnFuture.length>0?1:0.4}} title="Refazer (Ctrl+Shift+Z)">↪</button>
            <div style={{marginLeft:"auto",fontSize:11,fontFamily:"'Space Mono',monospace",color:C.t4}}>{reviewFiltered.length} itens</div>
          </div>
          {reviewFiltered.length===0?(<div style={{textAlign:"center",padding:"80px 0"}}><div style={{fontSize:48,marginBottom:16,opacity:0.15}}>✓</div><div style={{fontSize:18,fontWeight:600,marginBottom:8,color:"#2A9D8F"}}>{reviewShowAll?"Nenhuma transação encontrada.":"Tudo categorizado!"}</div><div style={{fontSize:13,color:C.t3}}>{reviewShowAll?"Use os filtros ou faça upload de novos documentos.":"Nenhuma transação pendente."}</div>{!reviewShowAll&&<button onClick={()=>setView("upload")} style={{...S.btn,background:C.greenBg,color:"#2A9D8F",marginTop:16}}>Upload</button>}</div>):(<div>
            {selectedTxns.size>0&&(<div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,padding:"10px 16px",background:C.purpleBg,borderRadius:12,flexWrap:"wrap",position:"sticky",top:0,zIndex:11}}>

              <span style={{fontSize:12,fontWeight:600,color:"#6C63FF"}}>{selectedTxns.size} selecionado{selectedTxns.size>1?"s":""}</span>
              <select value={bulkAction||""} onChange={e=>{setBulkAction(e.target.value||null);setBulkValue("");}} style={{...S.input,width:"auto",padding:"4px 10px",fontSize:11}}>
                <option value="">Ação em lote...</option>
                <option value="category">Alterar Categoria</option>
                <option value="source">Alterar Fonte</option>
                <option value="monthKey">Alterar Mês</option>
                <option value="currency">Alterar Moeda</option>
              </select>
              {bulkAction==="category"&&<select value={bulkValue} onChange={e=>setBulkValue(e.target.value)} style={{...S.input,width:"auto",padding:"4px 10px",fontSize:11}}><option value="">Selecionar...</option>{catNames.map(c=><option key={c} value={c}>{c}</option>)}</select>}
              {bulkAction==="source"&&<input value={bulkValue} onChange={e=>setBulkValue(e.target.value)} placeholder="Ex: Cartão Sicredi Maria" style={{...S.input,width:200,padding:"4px 10px",fontSize:11}}/>}
              {bulkAction==="monthKey"&&<select value={bulkValue} onChange={e=>setBulkValue(e.target.value)} style={{...S.input,width:"auto",padding:"4px 10px",fontSize:11}}><option value="">Selecionar...</option>{allMonthOptions.map(m=><option key={m} value={m}>{m}</option>)}</select>}
              {bulkAction==="currency"&&<select value={bulkValue} onChange={e=>setBulkValue(e.target.value)} style={{...S.input,width:"auto",padding:"4px 10px",fontSize:11}}><option value="">Selecionar...</option>{SUPPORTED_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select>}
              {bulkAction&&bulkValue&&<button onClick={applyBulk} style={{...S.btn,background:"#6C63FF",color:"#fff",padding:"4px 14px",fontSize:11}}>Aplicar</button>}
              <button onClick={deleteSelected} style={{...S.btn,background:C.redBg,color:"#E8575A",padding:"4px 14px",fontSize:11,border:"1px solid rgba(232,87,90,0.2)"}}>Excluir</button>
              <button onClick={()=>setSelectedTxns(new Set())} style={{...S.btn,background:C.bg2,color:C.t3,padding:"4px 14px",fontSize:11}}>Limpar</button>
            </div>)}
            <div style={{...S.card,padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead style={{position:"sticky",top:0,zIndex:5}}><tr style={{borderBottom:"1px solid "+C.border,background:C.bg}}>
                  <th style={{...S.th,padding:"8px 8px",width:36}}><input type="checkbox" checked={reviewFiltered.slice(0,200).length>0&&reviewFiltered.slice(0,200).every(t=>selectedTxns.has(t.id))} onChange={e=>{const visible=reviewFiltered.slice(0,200);if(e.target.checked){setSelectedTxns(prev=>{const n=new Set(prev);visible.forEach(t=>n.add(t.id));return n;});}else{setSelectedTxns(prev=>{const n=new Set(prev);visible.forEach(t=>n.delete(t.id));return n;});}}} style={{cursor:"pointer"}}/></th>
                  <SortTh label="Data" col="date" sort={reviewSort} setSort={setReviewSort}/>
                  <SortTh label="Descrição" col="description" sort={reviewSort} setSort={setReviewSort}/>
                  <SortTh label="Valor" col="value" sort={reviewSort} setSort={setReviewSort} align="right"/>
                  <SortTh label="Mês" col="monthKey" sort={reviewSort} setSort={setReviewSort}/>
                  <th style={{...S.th,padding:"8px 12px"}}>Categoria</th>
                  <SortTh label="Fonte" col="source" sort={reviewSort} setSort={setReviewSort}/>
                  <th style={{...S.th,padding:"8px 12px",width:40}}></th>
                </tr></thead>
                <tbody>{reviewFiltered.slice(0,200).map((t,idx)=>(<tr key={t.id} style={{borderBottom:"1px solid "+C.borderLight,background:selectedTxns.has(t.id)?"rgba(108,99,255,0.06)":t.category?C.card:C.redBg}}>
                  <td style={{padding:"4px 8px",textAlign:"center"}}><input type="checkbox" checked={selectedTxns.has(t.id)} onClick={e=>{const checked=!selectedTxns.has(t.id);if(e.shiftKey&&lastClickedIdx.current!=null){const visible=reviewFiltered.slice(0,200);const from=Math.min(lastClickedIdx.current,idx);const to=Math.max(lastClickedIdx.current,idx);setSelectedTxns(prev=>{const n=new Set(prev);for(let i=from;i<=to;i++)n.add(visible[i].id);return n;});}else{setSelectedTxns(prev=>{const n=new Set(prev);if(checked)n.add(t.id);else n.delete(t.id);return n;});}lastClickedIdx.current=idx;}} onChange={()=>{}} style={{cursor:"pointer"}}/></td>
                  <td style={{padding:"8px 14px",whiteSpace:"nowrap",width:100}}>{isEditing(t.id,"date","txn")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} placeholder="DD/MM/YYYY" style={{...S.input,padding:"4px 8px",fontSize:11,width:100}}/>):(<span onClick={()=>startEdit(t.id,"date","txn",t.date?t.date.toLocaleDateString("pt-BR"):"")} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border,color:C.t3,fontFamily:"'Space Mono',monospace",fontSize:11}}>{t.date?t.date.toLocaleDateString("pt-BR"):"—"}</span>)}</td>
                  <td style={{padding:"8px 14px",maxWidth:280}}>{isEditing(t.id,"description","txn")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11,width:"100%"}}/>):(<span onClick={()=>startEdit(t.id,"description","txn",t.description)} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.description}>{t.description}</span>)}</td>
                  <td style={{padding:"8px 14px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontWeight:600,width:140}}>{isEditing(t.id,"value","txn")?(<div style={{display:"flex",gap:4,alignItems:"center"}}><input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:11,textAlign:"right",width:90}}/><select value={editCurrency} onChange={e=>setEditCurrency(e.target.value)} style={{...S.input,padding:"4px 4px",fontSize:10,width:60}}>{SUPPORTED_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select><button onClick={commitEdit} style={{background:C.green,color:"#fff",border:"none",borderRadius:6,padding:"4px 6px",fontSize:10,cursor:"pointer"}}>OK</button></div>):(<span onClick={()=>{startEdit(t.id,"value","txn",String(t.originalValue||t.value));setEditCurrency(t.currency||"BRL");}} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border}}>{t.currency&&t.currency!=="BRL"?(<>{fmtCurrency(t.originalValue,t.currency)}<div style={{fontSize:10,color:C.t4,fontWeight:400}}>{fmt(t.brlValue)}</div></>):fmt(t.brlValue!=null?t.brlValue:t.value)}</span>)}</td>
                  <td style={{padding:"8px 14px",fontSize:11,fontFamily:"'Space Mono',monospace",color:C.t3}}>{isEditing(t.id,"monthKey","txn")?(<select autoFocus value={editVal} onChange={e=>{setEditVal(e.target.value);}} onBlur={commitEdit} style={{...S.input,padding:"4px 8px",fontSize:11}}>{allMonthOptions.map(m=><option key={m} value={m}>{m}</option>)}</select>):(<span onClick={()=>startEdit(t.id,"monthKey","txn",t.monthKey||"")} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border}}>{t.monthKey||"—"}</span>)}</td>
                  <td style={{padding:"8px 14px"}}>{editId===t.id?(<select autoFocus value={t.category||""} onChange={e=>updateCat(t.id,e.target.value)} onBlur={()=>setEditId(null)} style={{...S.input,padding:"4px 8px",fontSize:11}}><option value="">— Selecionar —</option>{catNames.map(c=><option key={c} value={c}>{c}</option>)}</select>):(t.category?(<button onClick={()=>setEditId(t.id)} style={{background:C.greenBg,border:"1px solid rgba(42,157,143,0.15)",borderRadius:8,padding:"4px 12px",color:"#2A9D8F",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>{t.category}</button>):(<button onClick={()=>setEditId(t.id)} style={{background:C.redBg,border:"1px solid rgba(232,87,90,0.15)",borderRadius:8,padding:"4px 12px",color:"#E8575A",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>⚠ Categorizar</button>))}</td>
                  <td style={{padding:"8px 14px",fontSize:10,maxWidth:150}}>{isEditing(t.id,"source","txn")?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} style={{...S.input,padding:"4px 8px",fontSize:10,width:"100%"}}/>):(<span onClick={()=>startEdit(t.id,"source","txn",t.source||"")} style={{cursor:"pointer",borderBottom:"1px dashed "+C.border,color:C.t4,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.source}>{t.source||"—"}</span>)}</td>
                  <td style={{padding:"4px 8px",textAlign:"center"}}><button onClick={()=>deleteTxn(t.id)} style={{background:"none",border:"none",color:C.t4,cursor:"pointer",fontSize:14,padding:"2px 6px",borderRadius:6,lineHeight:1}} title="Excluir">×</button></td>
                </tr>))}</tbody>
              </table>
              {reviewFiltered.length>200&&<div style={{padding:16,textAlign:"center",fontSize:12,color:C.t4}}>{"Mostrando 200 de "+reviewFiltered.length}</div>}
            </div>
          </div>)}
        </div>)}

        {/* ═══ INVESTMENTS ═══ */}
        {view==="investments"&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <div><div style={{fontSize:20,fontWeight:700}}>Investimentos</div><div style={{fontSize:13,color:C.t3,marginTop:4}}>Acompanhe seus investimentos e rendimentos mês a mês.</div></div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={undoInv} disabled={invHistory.length===0} style={{...S.btn,background:C.bg2,color:invHistory.length>0?C.t2:C.t4,border:"1px solid "+C.cardBorder,fontSize:11,padding:"5px 10px",opacity:invHistory.length>0?1:0.4}} title="Desfazer (Ctrl+Z)">↩</button>
              <button onClick={redoInv} disabled={invFuture.length===0} style={{...S.btn,background:C.bg2,color:invFuture.length>0?C.t2:C.t4,border:"1px solid "+C.cardBorder,fontSize:11,padding:"5px 10px",opacity:invFuture.length>0?1:0.4}} title="Refazer (Ctrl+Shift+Z)">↪</button>
              <button onClick={()=>{setInvDraft({value:"",tipo:"fixa",desc:"",rate:"",rateMode:"year",monthKey:""});setEditInvId(null);setShowNewInv(true)}} style={{...S.btn,background:C.purple,color:"#fff"}}>+ Novo Investimento</button>
            </div>
          </div>

          {investments.length===0?(<div style={{textAlign:"center",padding:"80px 0"}}><div style={{fontSize:48,marginBottom:16,opacity:0.12}}>📈</div><div style={{fontSize:16,fontWeight:600,color:C.t3}}>Nenhum investimento cadastrado</div><div style={{fontSize:13,color:C.t4,marginTop:6}}>Adicione seu primeiro investimento para acompanhar os rendimentos.</div></div>):(
          <div>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:14,marginBottom:24}}>
              <div style={{...S.card,padding:18}}>
                <div style={{fontSize:11,color:C.t3,textTransform:"uppercase",fontFamily:"'Space Mono',monospace",letterSpacing:"0.5px",marginBottom:6}}>Total Investido</div>
                <div style={{fontSize:20,fontWeight:700,color:C.purple}}>{fmt(investments.reduce((s,i)=>s+i.value,0))}</div>
              </div>
              <div style={{...S.card,padding:18}}>
                <div style={{fontSize:11,color:C.t3,textTransform:"uppercase",fontFamily:"'Space Mono',monospace",letterSpacing:"0.5px",marginBottom:6}}>Patrimônio Atual</div>
                <div style={{fontSize:20,fontWeight:700,color:C.green}}>{fmt(invTimeline.rows.reduce((s,r)=>s+r.currentBalance,0))}</div>
              </div>
              <div style={{...S.card,padding:18}}>
                <div style={{fontSize:11,color:C.t3,textTransform:"uppercase",fontFamily:"'Space Mono',monospace",letterSpacing:"0.5px",marginBottom:6}}>Rendimento Total</div>
                <div style={{fontSize:20,fontWeight:700,color:C.gold}}>{fmt(invTimeline.rows.reduce((s,r)=>s+r.totalYield,0))}</div>
              </div>
            </div>

            {/* Investment cards + timeline */}
            {invTimeline.rows.map(({inv,cells,currentBalance,totalYield})=>(
              <div key={inv.id} style={{...S.card,marginBottom:16,padding:0,overflow:"hidden"}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid "+C.borderLight}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:8,height:8,borderRadius:4,background:inv.tipo==="fixa"?C.green:C.purple}}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{inv.desc}</div>
                      <div style={{fontSize:11,color:C.t3,marginTop:2}}>
                        {inv.tipo==="fixa"?"Renda Fixa":"Renda Variável"} · Aporte em {inv.monthKey} · {fmt(inv.value)}
                        {inv.tipo==="fixa"&&(" · "+(inv.rateMonth*100).toFixed(3)+"% a.m.")}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:11,color:C.t4,fontFamily:"'Space Mono',monospace"}}>Saldo</div>
                      <div style={{fontWeight:700,color:C.green,fontFamily:"'Space Mono',monospace",fontSize:13}}>{fmt(currentBalance)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:11,color:C.t4,fontFamily:"'Space Mono',monospace"}}>Rendimento</div>
                      <div style={{fontWeight:700,color:totalYield>=0?C.gold:C.red,fontFamily:"'Space Mono',monospace",fontSize:13}}>{totalYield>=0?"+":""}{fmt(totalYield)}</div>
                    </div>
                    <button onClick={()=>openEditInv(inv)} style={{background:"none",border:"none",color:C.t4,cursor:"pointer",fontSize:13,padding:"4px 8px"}} title="Editar">✎</button>
                    <button onClick={()=>removeInvestment(inv.id)} style={{background:"none",border:"none",color:C.t4,cursor:"pointer",fontSize:16,padding:"4px 8px"}} title="Remover">×</button>
                  </div>
                </div>
                {/* Month timeline */}
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:cells.length*90}}>
                    <thead><tr>
                      {cells.filter(c=>c.active).map(c=>(<th key={c.mk} style={{padding:"8px 10px",textAlign:"center",borderBottom:"1px solid "+C.borderLight,color:c.isStart?C.purple:C.t4,fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:c.isStart?700:400,whiteSpace:"nowrap"}}>{c.mk}{c.isStart?" ●":""}</th>))}
                    </tr></thead>
                    <tbody>
                      <tr>{cells.filter(c=>c.active).map(c=>(<td key={c.mk+"b"} style={{padding:"6px 10px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:11,color:C.t2,borderBottom:"1px solid "+C.borderLight}}>{c.isStart?fmt(c.balance):fmt(c.balance)}</td>))}</tr>
                      <tr>{cells.filter(c=>c.active).map(c=>{
                        const isEditing=editInvCell&&editInvCell.invId===inv.id&&editInvCell.monthKey===c.mk;
                        const editable=inv.tipo==="variavel"&&!c.isStart;
                        return(<td key={c.mk+"y"} style={{padding:"4px 8px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:11,color:c.isStart?C.t4:c.yieldMonth>0?C.green:c.yieldMonth<0?C.red:C.t4,background:editable?C.bg2:"transparent",cursor:editable?"pointer":"default",borderBottom:"1px solid "+C.borderLight}} onClick={()=>{if(editable){setEditInvCell({invId:inv.id,monthKey:c.mk});setEditInvVal(String(c.yieldMonth||""));}}} title={editable?"Clique para editar rendimento":""}>
                          {isEditing?(<input autoFocus value={editInvVal} onChange={e=>setEditInvVal(e.target.value)} onBlur={()=>{setInvYield(inv.id,c.mk,editInvVal);setEditInvCell(null);}} onKeyDown={e=>{if(e.key==="Enter"){setInvYield(inv.id,c.mk,editInvVal);setEditInvCell(null);}if(e.key==="Escape")setEditInvCell(null);}} style={{...S.input,padding:"2px 6px",fontSize:11,width:80,textAlign:"right"}}/>):(
                            c.isStart?"—":(c.yieldMonth!==0||editable)?((c.yieldMonth>=0?"+":"")+fmt(c.yieldMonth)):"—"
                          )}
                        </td>);
                      })}</tr>
                      <tr>{cells.filter(c=>c.active).map(c=>(<td key={c.mk+"t"} style={{padding:"6px 10px",textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:10,color:c.totalYield>0?C.gold:c.totalYield<0?C.red:C.t4,fontWeight:600}}>{c.isStart?"—":(c.totalYield>=0?"+":"")+fmt(c.totalYield)}</td>))}</tr>
                    </tbody>
                  </table>
                  <div style={{display:"flex",gap:20,padding:"8px 16px",fontSize:10,color:C.t4,borderTop:"1px solid "+C.borderLight}}>
                    <span>Linha 1: Saldo</span>
                    <span>Linha 2: Rendimento no mês {inv.tipo==="variavel"&&<span style={{color:C.purple}}>(clique para editar)</span>}</span>
                    <span>Linha 3: Rendimento acumulado</span>
                  </div>
                </div>
              </div>
            ))}
          </div>)}
        </div>)}
      </main>

      {/* ═══ MODALS ═══ */}

      {/* New Category */}
      <Modal open={showNewCat} onClose={()=>{if(!aiLoading){setShowNewCat(false);setAiResult(null)}}} compact={isMobile}>
        {!aiResult?(<div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>Nova Categoria</div>
          <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Nome</label><input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Ex: Pets, Educação..." style={S.input} autoFocus/></div>
          <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Descrição (usada pela IA)</label><textarea value={newCatDesc} onChange={e=>setNewCatDesc(e.target.value)} placeholder="Descreva os tipos de gasto..." rows={3} style={{...S.input,resize:"vertical",lineHeight:1.6}}/></div>
          <div style={{marginBottom:20}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,fontFamily:"'Space Mono',monospace"}}>Cor</label><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{PALETTE.map(c=>(<button key={c} onClick={()=>setNewCatColor(c)} style={{width:26,height:26,borderRadius:6,background:c,border:newCatColor===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>))}</div></div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setShowNewCat(false);setNewCatName("");setNewCatDesc("")}} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button>
            <button onClick={handleCreateCat} disabled={!newCatName.trim()||!newCatDesc.trim()||aiLoading} style={{...S.btn,background:(!newCatName.trim()||!newCatDesc.trim())?"rgba(42,157,143,0.25)":"#2A9D8F",color:"#fff",opacity:aiLoading?0.6:1}}>{aiLoading?"⏳ Analisando...":"Criar"}</button>
          </div>
        </div>):(<div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Resultado da IA</div>
          <div style={{fontSize:13,color:C.t3,marginBottom:20}}>Categoria <span style={{color:newCatColor,fontWeight:600}}>"{aiResult.catName}"</span> criada. {aiResult.txnIds.length>0?`IA identificou ${aiResult.txnIds.length} transação(ões):`:"Nenhuma pendente."}</div>
          {aiResult.txnIds.length>0&&(<div style={{maxHeight:280,overflowY:"auto",marginBottom:20,borderRadius:12,border:"1px solid "+C.cardBorder}}>{aiResult.txnIds.map(id=>{const t=txns.find(tx=>tx.id===id);if(!t)return null;return(<div key={id} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid "+C.borderLight,fontSize:12}}><div style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:12}}>{t.description}</div><div style={{fontFamily:"'Space Mono',monospace",fontWeight:600,flexShrink:0}}>{fmt(t.value)}</div></div>);})}</div>)}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={rejectAi} style={{...S.btn,background:C.bg2,color:C.t3}}>{aiResult.txnIds.length>0?"Rejeitar":"Fechar"}</button>
            {aiResult.txnIds.length>0&&<button onClick={acceptAi} style={{...S.btn,background:"#2A9D8F",color:"#fff"}}>{"✓ Aceitar "+aiResult.txnIds.length}</button>}
          </div>
        </div>)}
      </Modal>

      <Modal open={!!deleteCat} onClose={()=>setDeleteCat(null)} compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:12}}>Deletar Categoria</div>
        <div style={{fontSize:13,color:C.t3,marginBottom:20}}>Deletar <span style={{color:"#E8575A",fontWeight:600}}>"{deleteCat}"</span>? As transações ficarão sem categoria.</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setDeleteCat(null)} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button><button onClick={confirmDeleteCat} style={{...S.btn,background:"#E8575A",color:"#fff"}}>Deletar</button></div>
      </Modal>

      <Modal open={!!editCat} onClose={()=>setEditCat(null)} compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:16}}>Editar: {editCat}</div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Descrição</label><textarea value={editCatDesc} onChange={e=>setEditCatDesc(e.target.value)} rows={3} style={{...S.input,resize:"vertical",lineHeight:1.6}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setEditCat(null)} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button><button onClick={handleEditCatSave} style={{...S.btn,background:"#2A9D8F",color:"#fff"}}>Salvar</button></div>
      </Modal>

      {/* Income Modal */}
      <Modal open={showIncome} onClose={()=>setShowIncome(false)} compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>Adicionar Receita</div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Mês</label>
          <select value={incMonth} onChange={e=>setIncMonth(e.target.value)} style={S.input}><option value="">Selecione...</option>{allMonthOptions.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,fontFamily:"'Space Mono',monospace"}}>Tipo</label>
          <div style={{display:"flex",gap:8}}>{[["maria","Maria","#C77DBA"],["ryo","Ryo","#5B8DEF"],["outros","Outros","#2A9D8F"]].map(([k,lb,cl])=>(<button key={k} onClick={()=>setIncType(k)} style={{...S.btn,flex:1,background:incType===k?cl+"12":C.bg2,color:incType===k?cl:C.t3,border:"1px solid "+(incType===k?cl+"40":C.cardBorder),borderRadius:10}}>{lb}</button>))}</div>
        </div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Valor (R$)</label><input value={incValue} onChange={e=>setIncValue(e.target.value)} placeholder="18500" style={S.input}/></div>
        <div style={{marginBottom:20}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Descrição</label><input value={incDesc} onChange={e=>setIncDesc(e.target.value)} placeholder="Salário, Freelance..." style={S.input}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setShowIncome(false)} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button><button onClick={addIncome} disabled={!incMonth||!incValue} style={{...S.btn,background:(!incMonth||!incValue)?"rgba(42,157,143,0.25)":"#2A9D8F",color:"#fff"}}>Adicionar</button></div>
      </Modal>

      {/* Expense Modal */}
      <Modal open={showExpense} onClose={()=>setShowExpense(false)} compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>Adicionar Gasto</div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Mês</label>
          <select value={expMonth} onChange={e=>setExpMonth(e.target.value)} style={S.input}><option value="">Selecione...</option>{allMonthOptions.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Data</label><input type="date" value={expDate} onChange={e=>setExpDate(e.target.value)} style={S.input}/></div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Descrição</label><input value={expDesc} onChange={e=>setExpDesc(e.target.value)} placeholder="Uber, Farmácia..." style={S.input}/></div>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Valor e Moeda</label>
          <div style={{display:"flex",gap:8}}>
            <input value={expValue} onChange={e=>setExpValue(e.target.value)} placeholder="150" style={{...S.input,flex:1}}/>
            <select value={expCurrency} onChange={e=>setExpCurrency(e.target.value)} style={{...S.input,width:"auto",flex:"0 0 90px"}}>{SUPPORTED_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
          </div>
          {expCurrency!=="BRL"&&<div style={{fontSize:11,color:C.t4,marginTop:4}}>Será convertido para BRL automaticamente.</div>}
        </div>
        <div style={{marginBottom:20}}><label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Categoria (opcional)</label>
          <select value={expCat} onChange={e=>setExpCat(e.target.value)} style={S.input}><option value="">— Sem categoria —</option>{catNames.map(c=><option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setShowExpense(false)} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button><button onClick={addExpense} disabled={!expMonth||!expValue} style={{...S.btn,background:(!expMonth||!expValue)?"rgba(232,87,90,0.25)":"#E8575A",color:"#fff"}}>Adicionar</button></div>
      </Modal>

      {/* Budget Editor Modal */}
      <Modal open={showBudget} onClose={()=>setShowBudget(false)} wide compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Editar Orçado</div>
        <div style={{fontSize:12,color:C.t3,marginBottom:20}}>Defina o orçamento de qualquer mês. Use "Aplicar para frente" para copiar para todos os meses seguintes.</div>
        <div style={{marginBottom:20,display:"flex",gap:10,alignItems:"flex-end"}}>
          <div style={{flex:1}}>
            <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Mês</label>
            <select value={budgetMonth?budgetMonth.split("/")[0]:""} onChange={e=>{const mn=e.target.value;const yr=budgetMonth?budgetMonth.split("/")[1]:"26";const mk=mn+"/"+yr;setBudgetMonth(mk);const existing=budget[mk]||{};const seed=FC_SEED.find(s=>s.month===mk);const draft={};for(const k of[...BUDGET_INCOME_KEYS,...EXPENSE_KEYS]){draft[k]=existing[k]!=null?existing[k]:(seed?seed.O[k]||0:0);}setBudgetDraft(draft);}} style={S.input}>
              <option value="">Mês...</option>
              {MONTH_NAMES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Ano</label>
            <select value={budgetMonth?budgetMonth.split("/")[1]:""} onChange={e=>{const yr=e.target.value;const mn=budgetMonth?budgetMonth.split("/")[0]:"Jan";const mk=mn+"/"+yr;setBudgetMonth(mk);const existing=budget[mk]||{};const seed=FC_SEED.find(s=>s.month===mk);const draft={};for(const k of[...BUDGET_INCOME_KEYS,...EXPENSE_KEYS]){draft[k]=existing[k]!=null?existing[k]:(seed?seed.O[k]||0:0);}setBudgetDraft(draft);}} style={S.input}>
              <option value="">Ano...</option>
              {Array.from({length:12},(_,i)=>String(25+i)).map(y=><option key={y} value={y}>20{y}</option>)}
            </select>
          </div>
        </div>
        {budgetMonth&&(<div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:20}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#2A9D8F",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,fontFamily:"'Space Mono',monospace"}}>Receitas</div>
              {BUDGET_INCOME_KEYS.map(k=>(<div key={k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <label style={{fontSize:12,color:C.t2,width:130,flexShrink:0}}>{budgetLabels[k]||k}</label>
                <input value={budgetDraft[k]||""} onChange={e=>setBudgetDraft(p=>({...p,[k]:parseFloat(e.target.value)||0}))} type="number" style={{...S.input,padding:"6px 10px",fontSize:12,textAlign:"right"}}/>
              </div>))}
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#E8575A",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,fontFamily:"'Space Mono',monospace"}}>Saídas</div>
              {EXPENSE_KEYS.map(k=>(<div key={k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <label style={{fontSize:12,color:C.t2,width:130,flexShrink:0}}>{budgetLabels[k]||k}</label>
                <input value={budgetDraft[k]||""} onChange={e=>setBudgetDraft(p=>({...p,[k]:parseFloat(e.target.value)||0}))} type="number" style={{...S.input,padding:"6px 10px",fontSize:12,textAlign:"right"}}/>
              </div>))}
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",borderTop:"1px solid "+C.border,paddingTop:16}}>
            <button onClick={()=>setShowBudget(false)} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button>
            <button onClick={()=>saveBudget(false)} style={{...S.btn,background:"#6C63FF",color:"#fff"}}>Salvar só {budgetMonth}</button>
            <button onClick={()=>saveBudget(true)} style={{...S.btn,background:"#2A9D8F",color:"#fff"}}>Aplicar para frente →</button>
          </div>
        </div>)}
      </Modal>

      {/* New Investment Modal */}
      <Modal open={showNewInv} onClose={()=>{setShowNewInv(false);setEditInvId(null)}} compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>{editInvId?"Editar Investimento":"Novo Investimento"}</div>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Mês do Aporte</label>
          <div style={{display:"flex",gap:8}}>
            <select value={invDraft.monthKey?invDraft.monthKey.split("/")[0]:""} onChange={e=>{const mn=e.target.value;const yr=invDraft.monthKey?invDraft.monthKey.split("/")[1]:"26";setInvDraft(p=>({...p,monthKey:mn+"/"+yr}));}} style={{...S.input,flex:1}}>
              <option value="">Mês...</option>{MONTH_NAMES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <select value={invDraft.monthKey?invDraft.monthKey.split("/")[1]:""} onChange={e=>{const yr=e.target.value;const mn=invDraft.monthKey?invDraft.monthKey.split("/")[0]:"Jan";setInvDraft(p=>({...p,monthKey:mn+"/"+yr}));}} style={{...S.input,flex:1}}>
              <option value="">Ano...</option>{Array.from({length:12},(_,i)=>String(25+i)).map(y=><option key={y} value={y}>20{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,fontFamily:"'Space Mono',monospace"}}>Tipo</label>
          <div style={{display:"flex",gap:8}}>
            {[["fixa","Renda Fixa",C.green],["variavel","Renda Variável",C.purple]].map(([k,lb,cl])=>(
              <button key={k} onClick={()=>setInvDraft(p=>({...p,tipo:k}))} style={{...S.btn,flex:1,background:invDraft.tipo===k?cl+"15":C.bg2,color:invDraft.tipo===k?cl:C.t3,border:"1px solid "+(invDraft.tipo===k?cl+"40":C.cardBorder),borderRadius:10}}>{lb}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Valor (R$)</label>
          <input value={invDraft.value} onChange={e=>setInvDraft(p=>({...p,value:e.target.value}))} placeholder="10000" style={S.input} type="text"/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Descrição</label>
          <input value={invDraft.desc} onChange={e=>setInvDraft(p=>({...p,desc:e.target.value}))} placeholder="CDB Banco X, Tesouro IPCA+, Ações..." style={S.input}/>
        </div>
        {invDraft.tipo==="fixa"&&(<div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,fontFamily:"'Space Mono',monospace"}}>Rendimento Esperado (%)</label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input value={invDraft.rate} onChange={e=>setInvDraft(p=>({...p,rate:e.target.value}))} placeholder={invDraft.rateMode==="year"?"12.5":"1.0"} style={{...S.input,flex:1}} type="text"/>
            <div style={{display:"flex",background:C.bg2,borderRadius:10,border:"1px solid "+C.cardBorder,overflow:"hidden",flexShrink:0}}>
              <button onClick={()=>setInvDraft(p=>({...p,rateMode:"month"}))} style={{padding:"8px 14px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",background:invDraft.rateMode==="month"?C.green:"transparent",color:invDraft.rateMode==="month"?"#fff":C.t3,fontFamily:"inherit"}}>a.m.</button>
              <button onClick={()=>setInvDraft(p=>({...p,rateMode:"year"}))} style={{padding:"8px 14px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",background:invDraft.rateMode==="year"?C.green:"transparent",color:invDraft.rateMode==="year"?"#fff":C.t3,fontFamily:"inherit"}}>a.a.</button>
            </div>
          </div>
          <div style={{fontSize:11,color:C.t4,marginTop:6}}>
            {invDraft.rate&&invDraft.rateMode==="year"?("≈ "+(Math.pow(1+parseFloat(invDraft.rate)/100,1/12)*100-100).toFixed(4)+"% ao mês"):""}
            {invDraft.rate&&invDraft.rateMode==="month"?("≈ "+(Math.pow(1+parseFloat(invDraft.rate)/100,12)*100-100).toFixed(2)+"% ao ano"):""}
          </div>
        </div>)}
        {invDraft.tipo==="variavel"&&(<div style={{padding:12,background:C.purpleBg,borderRadius:10,marginBottom:16,fontSize:12,color:C.purple}}>Os rendimentos da renda variável devem ser informados manualmente mês a mês na tabela de acompanhamento.</div>)}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>{setShowNewInv(false);setEditInvId(null)}} style={{...S.btn,background:C.bg2,color:C.t3}}>Cancelar</button>
          <button onClick={saveInvestment} disabled={!invDraft.monthKey||!invDraft.value} style={{...S.btn,background:(!invDraft.monthKey||!invDraft.value)?"rgba(108,99,255,0.25)":C.purple,color:"#fff"}}>{editInvId?"Salvar":"Adicionar"}</button>
        </div>
      </Modal>

      {/* AI Recategorization Confirmation Modal */}
      <Modal open={!!recatResult} onClose={()=>setRecatResult(null)} wide compact={isMobile}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Resultado da IA</div>
        <div style={{fontSize:13,color:C.t3,marginBottom:16}}>A IA propõe categorizar {recatResult?recatResult.length:0} transação(ões). Revise e aceite ou rejeite.</div>
        {recatResult&&recatResult.length>0&&(<div style={{maxHeight:isMobile?320:400,overflowY:"auto",marginBottom:16,borderRadius:12,border:"1px solid "+C.cardBorder}}>
          {recatResult.map((r,i)=>(<div key={r.txnId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:isMobile?"8px 10px":"10px 14px",borderBottom:"1px solid "+C.borderLight,fontSize:isMobile?11:12,gap:8}}>
            <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
            <div style={{fontFamily:"'Space Mono',monospace",fontWeight:600,flexShrink:0}}>{fmt(r.value)}</div>
            <div style={{flexShrink:0,fontSize:10,padding:"3px 8px",borderRadius:6,background:catColorMap[r.category]?catColorMap[r.category]+"18":"#eee",color:catColorMap[r.category]||C.t2,fontWeight:600}}>{r.category}</div>
          </div>))}
        </div>)}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={rejectRecat} style={{...S.btn,background:C.bg2,color:C.t3}}>Rejeitar</button>
          {recatResult&&recatResult.length>0&&<button onClick={acceptRecat} style={{...S.btn,background:"#2A9D8F",color:"#fff"}}>{"✓ Aceitar "+recatResult.length}</button>}
        </div>
      </Modal>

      </>}

      <style>{`
        *{box-sizing:border-box}
        select option{background:#fff;color:#1A1A2E}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.06);border-radius:3px}
        button:hover{opacity:0.88}
        textarea:focus,input:focus,select:focus{border-color:rgba(42,157,143,0.4)!important;outline:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        input[type=number]::-webkit-inner-spin-button{opacity:0.3}
      `}</style>
    </div>
  );
}
