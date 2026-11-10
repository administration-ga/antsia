/** MP07/MP08 : préparation financière privée, sans activation ni référence de compte. Jumeau ANTSIA/PRO.GA. */
import {
  COMMERCE_ENVIRONMENTS, COMMERCE_MAX_SKEW_MS, commerceAntsiaRef, commerceArray, commerceBoolean,
  commerceCapture, commerceInstant, commerceInteger, commerceIsMachineIdentity, commerceIsOpaqueId,
  commerceIsSha256, commerceLiteral, commerceParseCanonicalBody, commerceRecord, commerceRef, commerceReject, commerceText,
  type CommerceEnvironment, type CommerceResult,
} from "./commerce/primitives";
export const COMMERCE_PAYMENT_PREPARATION_CONTRACT = "PRO-COMMERCE-PAYMENT-PREPARATION-V1";
export const COMMERCE_PAYMENT_PREPARATION_PROFILE = "pro-ga-commerce-payment-preparation-hmac/v1";
export const COMMERCE_PAYMENT_PREPARATION_SCOPE = "commerce.payment.preparation.read";
export const COMMERCE_PAYMENT_PREPARATION_PATH = "/commerce/v1/payment/preparation";
export const COMMERCE_PAYMENT_PREPARATION_MAX_BYTES = 16 * 1024;
export const COMMERCE_PAYMENT_PREPARATION_TTL_MS = 60000;
export const COMMERCE_PAYMENT_PREPARATION_CONSENT_VERSION = "2026-10-21-mp07-payment-preparation-v1";
export const COMMERCE_PAYMENT_PREPARATION_RAILS = ["airtel_money", "moov_money", "card", "paypal"] as const;
export const COMMERCE_PAYMENT_PREPARATION_TARGETS = ["payments"] as const;
export const COMMERCE_PAYMENT_PREPARATION_POLICY_MODES = ["default_90", "default_85", "per_seller_contract", "custom_platform_retention"] as const;
export const COMMERCE_PAYMENT_PREPARATION_MISSING = [
 "configuration_ambiguous", "adapter_missing", "adapter_disabled", "adapter_unqualified", "merchant_contract_missing",
 "country_not_approved", "currency_not_approved", "entity_not_approved", "beneficiary_not_configured", "beneficiary_not_verified",
 "policy_not_configured", "policy_inactive", "policy_not_accepted", "stale_acceptance", "capability_unsupported",
 "source_permission_missing", "structure_not_verified", "collection_disabled", "payout_not_implemented",
] as const;
export type CommercePaymentPreparationRail = (typeof COMMERCE_PAYMENT_PREPARATION_RAILS)[number];
export type CommercePaymentPreparationMissing = (typeof COMMERCE_PAYMENT_PREPARATION_MISSING)[number];
export type CommercePaymentPreparationTarget = (typeof COMMERCE_PAYMENT_PREPARATION_TARGETS)[number];
export type CommercePaymentPreparationRequest = {
 readonly contract: typeof COMMERCE_PAYMENT_PREPARATION_CONTRACT; readonly version:1; readonly operation:"payment.preparation.read";
 readonly source:string; readonly environment:CommerceEnvironment; readonly requestId:string;
 readonly subject:{readonly kind:"seller_operator"; readonly ref:string; readonly authVerifiedAt:number};
 readonly issuedAt:number; readonly expiresAt:number; readonly linkRef:string; readonly shopRef:string; readonly antsiaShopRef:string;
};
export type CommercePaymentPreparationPolicy = {
 readonly textVersion:string; readonly revision:number; readonly platformRevision:number;
 readonly mode:(typeof COMMERCE_PAYMENT_PREPARATION_POLICY_MODES)[number]; readonly platformBps:number|null; readonly sellerBps:number|null;
 readonly accepted:boolean; readonly acceptanceRevision:number|null;
};
export type CommercePaymentPreparationRailState = {
 readonly rail:CommercePaymentPreparationRail; readonly qualified:boolean;
 readonly capabilities:{readonly collect:boolean;readonly lookup:boolean;readonly refund:boolean;readonly payout:false};
 readonly missing:readonly CommercePaymentPreparationMissing[];
};
export type CommercePaymentPreparationState = {
 readonly environment:CommerceEnvironment; readonly currency:"XAF";
 readonly countryScope:{readonly platformCountry:string|null;readonly sellerCountry:string|null};
 readonly collection:{readonly state:"closed"|"ready";readonly missing:readonly CommercePaymentPreparationMissing[]};
 readonly payout:{readonly state:"closed";readonly missing:readonly CommercePaymentPreparationMissing[]};
 readonly beneficiary:{readonly state:"not_configured"|"not_verified"|"verified";readonly label:string|null};
 readonly policy:CommercePaymentPreparationPolicy|null;readonly rails:readonly CommercePaymentPreparationRailState[];
 readonly target:CommercePaymentPreparationTarget|null;
};
type Base = {readonly contract:typeof COMMERCE_PAYMENT_PREPARATION_CONTRACT;readonly version:1;readonly requestId:string;readonly requestSha256:string};
export type CommercePaymentPreparationAccepted = Base & CommercePaymentPreparationState & {
 readonly outcome:"accepted";readonly linkRef:string;readonly shopRef:string;readonly checkedAt:number;readonly expiresAt:number;
};
export type CommercePaymentPreparationResponse = CommercePaymentPreparationAccepted | Base & {
 readonly outcome:"refused";readonly reason:"access_denied"|"capability_disabled"|"temporarily_unavailable";
};
export type CommercePaymentPreparationReason = "invalid_body"|"body_too_large"|"not_canonical"|"too_complex"|"invalid_payload"|"invalid_request"|"invalid_reference"|"invalid_time"|"source_mismatch"|"environment_mismatch"|"correlation_mismatch";
export function parseCommercePaymentPreparationRequest(raw: string, context: { source: string; environment: CommerceEnvironment; nowMs: number }): CommerceResult<CommercePaymentPreparationRequest, CommercePaymentPreparationReason> {
  return commerceCapture(() => {
    const row = commerceRecord(commerceParseCanonicalBody(raw, COMMERCE_PAYMENT_PREPARATION_MAX_BYTES), "$", ["contract", "version", "operation", "source", "environment", "requestId", "subject", "issuedAt", "expiresAt", "linkRef", "shopRef", "antsiaShopRef"]);
    if (row.contract !== COMMERCE_PAYMENT_PREPARATION_CONTRACT || row.version !== 1 || row.operation !== "payment.preparation.read") commerceReject("invalid_request", "$");
    if (!commerceIsMachineIdentity(row.source) || row.source !== context.source) commerceReject("source_mismatch", "$.source");
    const environment = commerceLiteral(row.environment, "$.environment", COMMERCE_ENVIRONMENTS);
    if (environment !== context.environment) commerceReject("environment_mismatch", "$.environment");
    if (!commerceIsOpaqueId(row.requestId)) commerceReject("invalid_request", "$.requestId");
    const issuedAt = commerceInstant(row.issuedAt, "$.issuedAt"), expiresAt = commerceInstant(row.expiresAt, "$.expiresAt");
    if (!Number.isSafeInteger(context.nowMs) || Math.abs(issuedAt - context.nowMs) > COMMERCE_MAX_SKEW_MS || expiresAt <= context.nowMs || expiresAt <= issuedAt || expiresAt - issuedAt > COMMERCE_PAYMENT_PREPARATION_TTL_MS) commerceReject("invalid_time", "$.expiresAt");
    const subject = commerceRecord(row.subject, "$.subject", ["kind", "ref", "authVerifiedAt"]);
    if (subject.kind !== "seller_operator") commerceReject("invalid_request", "$.subject.kind");
    const authVerifiedAt = commerceInstant(subject.authVerifiedAt, "$.subject.authVerifiedAt");
    if (authVerifiedAt > issuedAt || issuedAt - authVerifiedAt > COMMERCE_MAX_SKEW_MS) commerceReject("invalid_time", "$.subject.authVerifiedAt");
    return { contract: COMMERCE_PAYMENT_PREPARATION_CONTRACT, version: 1, operation: "payment.preparation.read", source: row.source, environment, requestId: row.requestId,
      issuedAt, expiresAt, subject: { kind: "seller_operator", ref: commerceAntsiaRef(subject.ref, "$.subject.ref", "sub"), authVerifiedAt },
      linkRef: commerceRef(row.linkRef, "$.linkRef", ["commerce_link"]), shopRef: commerceRef(row.shopRef, "$.shopRef", ["structure"]), antsiaShopRef: commerceAntsiaRef(row.antsiaShopRef, "$.antsiaShopRef", "shop") };
  });
}

export function commercePaymentPreparationSigningInput(input: { bodySha256: string; environment: CommerceEnvironment; issuedAtMs: number; keyId: string; nonce: string; operation: "payment.preparation.read"; source: string }): string | null {
  if (!commerceIsSha256(input.bodySha256) || !commerceIsMachineIdentity(input.source) || !COMMERCE_ENVIRONMENTS.includes(input.environment) || input.operation !== "payment.preparation.read" || !Number.isSafeInteger(input.issuedAtMs) || input.issuedAtMs < 0 || !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.keyId) || !/^[A-Za-z0-9_-]{24,128}$/u.test(input.nonce)) return null;
  return [COMMERCE_PAYMENT_PREPARATION_PROFILE, input.keyId, String(input.issuedAtMs), input.nonce, input.source, input.environment, "pro.ga.commerce.payment.preparation", COMMERCE_PAYMENT_PREPARATION_SCOPE, input.operation, input.bodySha256].map(value => `${value.length}:${value}`).join("|");
}

function readMissing(raw:unknown,path:string):readonly CommercePaymentPreparationMissing[] {
 const items=commerceArray(raw,path,0,COMMERCE_PAYMENT_PREPARATION_MISSING.length).map((item,index)=>commerceLiteral(item,`${path}[${index}]`,COMMERCE_PAYMENT_PREPARATION_MISSING));
 if(new Set(items).size!==items.length) commerceReject("invalid_payload",path);
 return items;
}
function country(raw:unknown,path:string):string|null {
 if(raw===null)return null;
 if(typeof raw!=="string"||!/^[A-Z]{2}$/u.test(raw))commerceReject("invalid_payload",path);
 return raw;
}
function readState(raw:unknown):CommercePaymentPreparationState {
 const row=commerceRecord(raw,"$.state",["environment","currency","countryScope","collection","payout","beneficiary","policy","rails","target"]);
 const environment=commerceLiteral(row.environment,"$.environment",COMMERCE_ENVIRONMENTS);
 if(row.currency!=="XAF")commerceReject("invalid_payload","$.currency");
 const scope=commerceRecord(row.countryScope,"$.countryScope",["platformCountry","sellerCountry"]);
 const countryScope={platformCountry:country(scope.platformCountry,"$.countryScope.platformCountry"),sellerCountry:country(scope.sellerCountry,"$.countryScope.sellerCountry")};
 const collection=commerceRecord(row.collection,"$.collection",["state","missing"]),payout=commerceRecord(row.payout,"$.payout",["state","missing"]);
 const collectionState=commerceLiteral(collection.state,"$.collection.state",["closed","ready"] as const),collectionMissing=readMissing(collection.missing,"$.collection.missing"),payoutMissing=readMissing(payout.missing,"$.payout.missing");
 if(payout.state!=="closed"||!payoutMissing.includes("payout_not_implemented"))commerceReject("invalid_payload","$.payout");
 const beneficiary=commerceRecord(row.beneficiary,"$.beneficiary",["state","label"]);
 const beneficiaryState=commerceLiteral(beneficiary.state,"$.beneficiary.state",["not_configured","not_verified","verified"] as const);
 const label=beneficiary.label===null?null:commerceText(beneficiary.label,"$.beneficiary.label",1,120);
 if((beneficiaryState==="verified")!==(label!==null)||label!==null&&(label!==label.normalize("NFC")||/[<>]|(?:https?:\/\/|www\.)/iu.test(label)))commerceReject("invalid_payload","$.beneficiary");
 let policy:CommercePaymentPreparationPolicy|null=null;
 if(row.policy!==null){
  const item=commerceRecord(row.policy,"$.policy",["textVersion","revision","platformRevision","mode","platformBps","sellerBps","accepted","acceptanceRevision"]);
  const platformBps=item.platformBps===null?null:commerceInteger(item.platformBps,"$.policy.platformBps",0,10000),sellerBps=item.sellerBps===null?null:commerceInteger(item.sellerBps,"$.policy.sellerBps",0,10000);
  const accepted=commerceBoolean(item.accepted,"$.policy.accepted"),acceptanceRevision=item.acceptanceRevision===null?null:commerceInteger(item.acceptanceRevision,"$.policy.acceptanceRevision",1,Number.MAX_SAFE_INTEGER);
  const mode=commerceLiteral(item.mode,"$.policy.mode",COMMERCE_PAYMENT_PREPARATION_POLICY_MODES);
  if((platformBps===null)!==(sellerBps===null)||platformBps!==null&&sellerBps!==null&&platformBps+sellerBps!==10000||accepted!==(acceptanceRevision!==null)||accepted&&platformBps===null||mode!=="per_seller_contract"&&platformBps===null||mode==="default_90"&&platformBps!==1000||mode==="default_85"&&platformBps!==1500)commerceReject("invalid_payload","$.policy");
  policy={textVersion:commerceText(item.textVersion,"$.policy.textVersion",1,100),revision:commerceInteger(item.revision,"$.policy.revision",1,Number.MAX_SAFE_INTEGER),platformRevision:commerceInteger(item.platformRevision,"$.policy.platformRevision",1,Number.MAX_SAFE_INTEGER),mode,platformBps,sellerBps,accepted,acceptanceRevision};
 }
 const rails=commerceArray(row.rails,"$.rails",4,4).map((value,index):CommercePaymentPreparationRailState=>{
  const path=`$.rails[${index}]`,item=commerceRecord(value,path,["rail","qualified","capabilities","missing"]),caps=commerceRecord(item.capabilities,`${path}.capabilities`,["collect","lookup","refund","payout"]);
  const qualified=commerceBoolean(item.qualified,`${path}.qualified`),collect=commerceBoolean(caps.collect,`${path}.capabilities.collect`),lookup=commerceBoolean(caps.lookup,`${path}.capabilities.lookup`),refund=commerceBoolean(caps.refund,`${path}.capabilities.refund`);
  if(caps.payout!==false||!qualified&&(collect||lookup||refund)||collect&&!lookup)commerceReject("invalid_payload",path);
  const missing=readMissing(item.missing,`${path}.missing`);
  const qualificationBlockers:readonly CommercePaymentPreparationMissing[]=["configuration_ambiguous","adapter_missing","adapter_disabled","adapter_unqualified","merchant_contract_missing","country_not_approved","currency_not_approved","entity_not_approved","beneficiary_not_configured","beneficiary_not_verified","capability_unsupported"];
  if(qualified&&(!countryScope.platformCountry||!countryScope.sellerCountry||missing.some(reason=>qualificationBlockers.includes(reason)))||collect&&missing.length>0)commerceReject("invalid_payload",path);
  return {rail:commerceLiteral(item.rail,`${path}.rail`,COMMERCE_PAYMENT_PREPARATION_RAILS),qualified,capabilities:{collect,lookup,refund,payout:false},missing};
 });
 if(new Set(rails.map(item=>item.rail)).size!==4||(collectionState==="ready")!==rails.some(item=>item.capabilities.collect)||beneficiaryState==="verified"&&!rails.some(item=>item.qualified&&item.capabilities.lookup)||collectionState==="ready"&&(!countryScope.platformCountry||!countryScope.sellerCountry||collectionMissing.length>0||beneficiaryState!=="verified"||!policy?.accepted))commerceReject("invalid_payload","$.collection");
 return {environment,currency:"XAF",countryScope,collection:{state:collectionState,missing:collectionMissing},payout:{state:"closed",missing:payoutMissing},beneficiary:{state:beneficiaryState,label},policy,rails,target:row.target===null?null:commerceLiteral(row.target,"$.target",COMMERCE_PAYMENT_PREPARATION_TARGETS)};
}
export function parseCommercePaymentPreparationResponse(raw:string,context:{request:CommercePaymentPreparationRequest;requestSha256:string;nowMs:number}):CommerceResult<CommercePaymentPreparationResponse,CommercePaymentPreparationReason>{
 return commerceCapture(()=>{
  const parsed=commerceParseCanonicalBody(raw,COMMERCE_PAYMENT_PREPARATION_MAX_BYTES);
  const stateKeys=["environment","currency","countryScope","collection","payout","beneficiary","policy","rails","target"] as const;
  const row=commerceRecord(parsed,"$",["contract","version","requestId","requestSha256","outcome"],["reason","linkRef","shopRef","checkedAt","expiresAt",...stateKeys]);
  if(row.contract!==COMMERCE_PAYMENT_PREPARATION_CONTRACT||row.version!==1||row.requestId!==context.request.requestId||!commerceIsSha256(context.requestSha256)||row.requestSha256!==context.requestSha256)commerceReject("correlation_mismatch","$");
  const base={contract:COMMERCE_PAYMENT_PREPARATION_CONTRACT,version:1,requestId:context.request.requestId,requestSha256:context.requestSha256} as const;
  if(row.outcome==="refused"){
   const refused=commerceRecord(parsed,"$",["contract","version","requestId","requestSha256","outcome","reason"]);
   return {...base,outcome:"refused",reason:commerceLiteral(refused.reason,"$.reason",["access_denied","capability_disabled","temporarily_unavailable"] as const)};
  }
  commerceRecord(parsed,"$",["contract","version","requestId","requestSha256","outcome","linkRef","shopRef","checkedAt","expiresAt",...stateKeys]);
  if(row.outcome!=="accepted"||row.linkRef!==context.request.linkRef||row.shopRef!==context.request.shopRef)commerceReject("correlation_mismatch","$");
  const checkedAt=commerceInstant(row.checkedAt,"$.checkedAt"),expiresAt=commerceInstant(row.expiresAt,"$.expiresAt");
  if(!Number.isSafeInteger(context.nowMs)||Math.abs(checkedAt-context.nowMs)>COMMERCE_MAX_SKEW_MS||checkedAt<context.request.issuedAt-COMMERCE_MAX_SKEW_MS||expiresAt<=context.nowMs||expiresAt<=checkedAt||expiresAt>context.request.expiresAt||expiresAt-checkedAt>COMMERCE_PAYMENT_PREPARATION_TTL_MS)commerceReject("invalid_time","$.expiresAt");
  const state=readState(Object.fromEntries(stateKeys.map(key=>[key,row[key]])));
  if(state.environment!==context.request.environment)commerceReject("environment_mismatch","$.environment");
  return {...base,outcome:"accepted",linkRef:context.request.linkRef,shopRef:context.request.shopRef,checkedAt,expiresAt,...state};
 });
}
