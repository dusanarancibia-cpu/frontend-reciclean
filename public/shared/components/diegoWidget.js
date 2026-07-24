// COMPONENTE · Widget flotante del chatbot "Diego" (FAB amarillo + ventana de chat).
// Diseño extraído EXACTO de panel-rdo.html (Diego v6). Auto-contenido: inyecta su
// propio <style> + markup. La lógica (abrir/cerrar/adjuntar/subir) vive en el
// controllers/diegoController.js — este componente solo pinta la UI.

const CSS = `
.diego-fab{position:fixed;right:24px;bottom:24px;width:66px;height:66px;background:linear-gradient(135deg,#fde047,#eab308);color:#1f2937;border-radius:50%;border:2px solid #ca8a04;box-shadow:0 16px 32px -10px rgba(202,138,4,.85);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease;z-index:94;animation:diegoInviteGlow 2.6s ease-in-out infinite}
.diego-fab:hover{transform:scale(1.08);box-shadow:0 18px 36px -8px rgba(202,138,4,.95);animation-play-state:paused}
@keyframes diegoInviteGlow{0%,100%{box-shadow:0 16px 32px -10px rgba(202,138,4,.85),0 0 0 0 rgba(234,179,8,.55)}50%{box-shadow:0 16px 32px -10px rgba(202,138,4,.85),0 0 0 10px rgba(234,179,8,0)}}
.diego-fab-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;background:#ef4444;color:#fff;border-radius:10px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
.diego-fab-badge.hidden{display:none}
.diego-fab-label{position:absolute;right:74px;top:50%;transform:translateY(-50%);background:#0f172a;color:#fff;padding:6px 12px;border-radius:8px;font-size:13px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s ease}
.diego-fab:hover .diego-fab-label{opacity:1}

.diego-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:94;display:none}
.diego-backdrop.open{display:block}
/* Modal amplio y centrado (estilo productividad) */
.diego-chat{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:800px;max-width:90vw;height:70vh;max-height:90vh;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 64px -16px rgba(15,23,42,.4);z-index:95;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px}
.diego-chat.open{display:flex}
.diego-chat-h{background:#059669;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;font-weight:600;flex-shrink:0}
.diego-chat-h .h-title{display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-width:0;flex:1}
.diego-chat-h .h-title-row{display:flex;align-items:center;gap:8px}
.diego-chat-h .h-sub{font-size:11px;font-weight:500;opacity:.9;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.diego-chat-h .h-actions{display:flex;gap:2px;align-items:center;flex-shrink:0}
.diego-chat-h .h-status-dot{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.7);animation:diegoStatusPulse 2s infinite;display:inline-block;flex-shrink:0}
@keyframes diegoStatusPulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}70%{box-shadow:0 0 0 8px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
.diego-chat-h .h-version{background:rgba(255,255,255,.2);padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;flex-shrink:0}
.diego-chat-h button{background:none;border:0;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:4px 8px;border-radius:6px}
.diego-chat-h button:hover{background:rgba(255,255,255,.15)}
.diego-chat-body{background:#f8fafc;flex:1;min-height:220px;overflow-y:auto;overflow-x:hidden;position:relative;padding:14px;display:flex;flex-direction:column;gap:8px}
.diego-empty{color:#94a3b8;font-size:12px;text-align:center;padding:24px 8px;margin:auto}
.diego-msg{font-size:14px;padding:10px 14px;border-radius:14px;max-width:85%;line-height:1.45;word-wrap:break-word;white-space:pre-wrap}
.diego-msg.mine{align-self:flex-end;background:#059669;color:#fff;border-bottom-right-radius:4px}
.diego-msg.theirs{align-self:flex-start;background:#f1f5f9;border:1px solid #e2e8f0;color:#0f172a;border-bottom-left-radius:4px}
.diego-msg-attach{font-size:11px;background:#eff6ff;border:1px solid #dbeafe;padding:3px 8px;border-radius:6px;color:#1e40af;margin-top:6px;display:inline-block}
.diego-attach-preview{padding:6px 10px;background:#eff6ff;border-top:1px solid #dbeafe;font-size:11px;color:#1e40af;display:flex;justify-content:space-between;align-items:center}
.diego-attach-preview button{background:none;border:0;color:#1e40af;cursor:pointer;font-size:14px}
.diego-chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:12px 12px 8px;border-top:1px solid #e2e8f0;background:#fff;align-items:center;flex-shrink:0}
.diego-chat-form textarea{width:100%;min-width:0;border:1px solid #e2e8f0;border-radius:24px;padding:10px 16px;font-size:14px;outline:none;font-family:inherit;resize:none;min-height:40px;max-height:120px}
.diego-chat-form textarea:focus{border-color:#059669;box-shadow:0 0 0 3px rgba(5,150,105,.15)}
.diego-chat-form button.send{background:#059669;color:#fff;border:0;border-radius:24px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}
.diego-composer-secondary{display:flex;justify-content:flex-start;padding:6px 12px;background:#fff;border-top:1px dashed #eef1f5}
#diegoAttachBtn{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:8px;background:transparent;color:#94a3b8;border:0;cursor:pointer}
#diegoAttachBtn:hover{background:#f1f5f9;color:#475569}
#diegoAttachBtn span{font-size:11px;font-weight:500}
/* Tabla de precios extraídos (TAREA 2) dentro de la burbuja de Diego */
.diego-tabla{border-collapse:collapse;width:100%;margin-top:8px;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.diego-tabla th{background:#ecfdf5;color:#065f46;text-align:left;padding:6px 10px;font-weight:700;font-size:12px}
.diego-tabla td{padding:6px 10px;border-top:1px solid #eef1f5}
.diego-tabla td.precio{text-align:right;font-weight:600;color:#047857;white-space:nowrap}
/* Minimizado: barra fina anclada abajo-derecha (sale del centro) */
.diego-chat.minimized{top:auto;left:auto;right:24px;bottom:24px;transform:none;width:320px;height:auto;max-height:48px;overflow:hidden}
.diego-chat.minimized .h-sub{display:none}
.diego-chat.minimized .diego-chat-body,
.diego-chat.minimized .diego-attach-preview,
.diego-chat.minimized .diego-composer-secondary,
.diego-chat.minimized .diego-chat-form{display:none}
`;

const HTML = `
<div class="diego-backdrop" id="diegoBackdrop" aria-hidden="true"></div>
<button class="diego-fab" id="diegoFab" type="button" aria-label="Abrir chat Diego">
  <svg width="30" height="30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
  <span class="diego-fab-label">Diego — pregúntame</span>
  <span class="diego-fab-badge hidden" id="diegoFabBadge">0</span>
</button>

<div class="diego-chat" id="diegoChat" role="dialog" aria-label="Chat con Diego">
  <div class="diego-chat-h" id="diegoChatHeader">
    <span class="h-title">
      <span class="h-title-row"><span class="h-status-dot"></span>🤖 Diego <span class="h-version">v6</span></span>
      <span class="h-sub">Asistente de precios</span>
    </span>
    <div class="h-actions">
      <button type="button" id="diegoChatMinimize" title="Minimizar">−</button>
      <button type="button" id="diegoChatClose" title="Cerrar">✕</button>
    </div>
  </div>

  <div class="diego-chat-body" id="diegoChatBody">
    <div class="diego-empty" id="diegoEmpty">Escribe, adjunta una foto o pregunta lo que quieras.</div>
  </div>

  <div class="diego-attach-preview" id="diegoAttachPreview" style="display:none;">
    <span id="diegoAttachName"></span>
    <button type="button" id="diegoAttachRemove" aria-label="Quitar adjunto">✕</button>
  </div>

  <form class="diego-chat-form" id="diegoChatForm" autocomplete="off">
    <input type="file" id="diegoFileInput" accept="image/*" style="display:none;" />
    <textarea id="diegoChatInput" placeholder="Escribe o adjunta una foto…" maxlength="2000" rows="1"></textarea>
    <button type="submit" class="send" id="diegoChatSend">Enviar</button>
  </form>

  <div class="diego-composer-secondary">
    <button type="button" id="diegoAttachBtn" title="Adjuntar foto de lista de precios">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.98 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
      <span>Adjuntar</span>
    </button>
  </div>
</div>
`;

export function renderDiegoWidget(mountEl) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  mountEl.innerHTML = HTML;
}
