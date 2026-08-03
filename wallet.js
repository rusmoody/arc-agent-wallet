/**
 * Wallet UI.
 *
 * Flow: connect → propose a tx → the engine screens it → sign is offered ONLY
 * when the verdict allows. A blocked action never gets a sign button; a confirm
 * requires an explicit, informed tap. The signing itself uses ethers.js against
 * Arc testnet — but no key ever touches this code.
 */

import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm';
import {
  ARC, LocalKnowledge, transferIntent, approvalIntent, screen,
  policy, envelope, Autonomy, UNLIMITED,
} from './adapter.js';

const $ = (id) => document.getElementById(id);
const know = new LocalKnowledge();

// Demo policy: 100 USDC per tx, 500/day, advanced autonomy.
// In a real app the user sets these; here they show the envelope holding.
const userPolicy = policy({
  envelope: envelope({ perTxCap: 100, dailyCap: 500 }),
  autonomy: Autonomy.ADVANCED,
});

let provider = null;
let signer = null;
let account = null;

// Minimal ERC-20 ABI for the optional USDC interface on Arc.
const ERC20 = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

// ---- connect ----
async function connect() {
  if (!window.ethereum) {
    $('conn-status').textContent = 'No wallet found. Install MetaMask.';
    return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  await ensureArc();
  signer = await provider.getSigner();
  account = await signer.getAddress();
  $('conn-status').textContent = 'Connected.';
  $('acct').textContent = account;
  $('net-hint').hidden = false;
  $('screen').disabled = false;
}

// ---- switch/add Arc testnet ----
async function ensureArc() {
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: ARC.chainIdHex }]);
  } catch (err) {
    // 4902 = chain not added yet
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message || '')) {
      await provider.send('wallet_addEthereumChain', [{
        chainId: ARC.chainIdHex,
        chainName: ARC.name,
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: [ARC.rpc],
        blockExplorerUrls: [ARC.explorer],
      }]);
    } else {
      throw err;
    }
  }
}

// ---- form toggles ----
function syncForm() {
  const kind = $('kind').value;
  $('transfer-fields').hidden = kind !== 'transfer';
  $('approve-fields').hidden = kind !== 'approve';
}
function syncAllowance() {
  $('exact-wrap').hidden = $('allowance-kind').value !== 'exact';
}

// ---- screen + gate ----
function buildProposal() {
  if ($('kind').value === 'transfer') {
    const to = $('to').value.trim();
    const amount = Number($('amount').value || 0);
    if (!ethers.isAddress(to)) throw new Error('Recipient is not a valid address.');
    if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
    return { type: 'transfer', to, amount,
             intent: transferIntent({ to, amount }, know) };
  }
  const spender = $('spender').value.trim();
  if (!ethers.isAddress(spender)) throw new Error('Contract is not a valid address.');
  const unlimited = $('allowance-kind').value === 'unlimited';
  const allowance = unlimited ? UNLIMITED
    : BigInt(Math.floor(Number($('allow-amount').value || 0) * 10 ** ARC.usdcDecimals));
  return { type: 'approve', spender, allowance, unlimited,
           intent: approvalIntent({ spender, allowance }, know) };
}

function onScreen() {
  const box = $('result');
  let proposal;
  try {
    proposal = buildProposal();
  } catch (e) {
    box.innerHTML = `<div class="card"><span class="status">${e.message}</span></div>`;
    return;
  }

  const r = screen(proposal.intent, userPolicy);
  renderVerdict(r, proposal);
}

function renderVerdict(r, proposal) {
  const box = $('result');
  const titles = {
    allow: 'The engine allows this',
    confirm: 'The engine wants you to confirm',
    block: 'The engine blocks this',
  };
  const advice = {
    allow: 'No warning signs under your current policy. You can sign.',
    confirm: 'This is within your limits but not routine. Read the reasons, then decide.',
    block: 'This will not be offered for signing. Signing it would put your funds at risk.',
  };

  let html = `<div class="verdict" data-d="${r.decision}">
    <h3>${titles[r.decision]}</h3>
    <div class="why">${advice[r.decision]}</div>`;

  for (const s of r.signals.slice().sort((a, b) => b.severity - a.severity)) {
    html += `<div class="signal">${s.explanation}</div>`;
  }
  for (const reason of r.reasons) {
    html += `<div class="signal">${reason}</div>`;
  }

  html += `<div class="actions">`;
  if (r.mayOfferSign) {
    const label = r.decision === 'allow' ? 'Sign & send' : 'I understand — sign anyway';
    html += `<button class="${r.decision === 'allow' ? 'primary' : 'ghost'}" id="sign">${label}</button>`;
  } else {
    html += `<span class="status">Signing is disabled for a blocked action.</span>`;
  }
  html += `<span class="status" id="sign-status"></span></div></div>`;

  box.innerHTML = html;

  const signBtn = $('sign');
  if (signBtn) signBtn.addEventListener('click', () => doSign(proposal));
}

// ---- the gated signature ----
async function doSign(proposal) {
  const status = $('sign-status');
  if (!signer) { status.textContent = 'Connect a wallet first.'; return; }
  try {
    status.textContent = 'Awaiting signature in your wallet…';
    const usdc = new ethers.Contract(ARC.usdcErc20, ERC20, signer);
    let tx;
    if (proposal.type === 'transfer') {
      const units = ethers.parseUnits(String(proposal.amount), ARC.usdcDecimals);
      tx = await usdc.transfer(proposal.to, units);
    } else {
      tx = await usdc.approve(proposal.spender, proposal.allowance);
    }
    status.innerHTML = `Sent. <a href="${ARC.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">View on arcscan</a>`;
    // Remember the counterparty so next time it's "seen before".
    know.markSeen(proposal.to || proposal.spender);
    await tx.wait();
    status.innerHTML = `Confirmed. <a href="${ARC.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">View on arcscan</a>`;
  } catch (e) {
    status.textContent = e?.shortMessage || e?.message || 'Transaction failed.';
  }
}

// ---- wire up ----
$('connect').addEventListener('click', connect);
$('kind').addEventListener('change', syncForm);
$('allowance-kind').addEventListener('change', syncAllowance);
$('screen').addEventListener('click', onScreen);
syncForm();
syncAllowance();
