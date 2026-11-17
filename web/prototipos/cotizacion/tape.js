// Cinta de cotizaciones: copia lo que app.js ya dibujó en la pizarra (no busca nada por su cuenta).
(() => {
  const list = document.getElementById("list");
  const track = document.getElementById("tape");
  if (!list || !track) return;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const build = () => {
    const items = [...list.querySelectorAll(".shop")].slice(0, 14).map((shop) => {
      const name = shop.querySelector(".shop-name")?.textContent.trim() || "";
      const deal = shop.querySelector(".deal");
      if (!deal) return null;
      const what = deal.querySelector(".deal-name")?.childNodes[0]?.textContent.trim() || "";
      const off = deal.querySelector(".deal-off")?.textContent.trim().replace("−", "") || "";
      const now = deal.querySelector(".deal-price b")?.textContent.replace("ahora", "").trim() || "";
      return `<span><b>${esc(name.split(" - ")[0])}</b> ${esc(what)} ${esc(now)} <span class="dn">▼${esc(off)}</span></span>`;
    }).filter(Boolean);
    if (!items.length) return;
    const row = items.join("");
    track.innerHTML = row + row; // dos vueltas seguidas para que la cinta no corte
  };
  new MutationObserver(build).observe(list, { childList: true });
  build();
})();
