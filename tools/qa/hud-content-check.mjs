// Runs inside the page. Plate geometry alone misses labels that escape their own card.
export function checkHudContents() {
  const faults = [];
  const visible = el => el && !el.closest('[hidden]') && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const rect = el => el.getBoundingClientRect();
  const label = el => el.id || el.className || el.tagName;
  const overlaps = (a, b) => {
    const x = rect(a), y = rect(b);
    return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2;
  };
  for (const [selector, children] of [
    ['#specBar .sp-card', '.sp-eyebrow > *, .sp-main > *, .sp-bars > *'],
    ['#ammoBox', '#wName, #reload, #ammo'],
    ['#killConfirm', 'b, em'],
  ]) {
    const card = document.querySelector(selector);
    if (!visible(card)) continue;
    const bounds = rect(card);
    if (card.scrollWidth > card.clientWidth + 1) faults.push(`${selector}: content scrolls sideways`);
    for (const child of card.querySelectorAll(children)) {
      if (!visible(child)) continue;
      const box = rect(child);
      if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) faults.push(`${label(child)} leaves ${selector}`);
    }
  }
  for (const group of ['#specBar .sp-eyebrow > *', '#specBar .sp-main > *', '#ammoBox #wName, #ammoBox #reload, #ammoBox #ammo']) {
    const children = [...document.querySelectorAll(group)].filter(visible);
    for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++)
      if (overlaps(children[i], children[j])) faults.push(`${label(children[i])} overlaps ${label(children[j])}`);
  }
  const confirmation = document.querySelector('#killConfirm');
  // The weapon column has empty space beside its narrower ammo card; check the painted cards themselves.
  if (visible(confirmation)) for (const plate of document.querySelectorAll('#bagTag,#consbar,#vitals,#ammoBox,#hotbar .hs'))
    if (visible(plate) && overlaps(confirmation, plate)) faults.push(`killConfirm overlaps ${label(plate)}`);
  for (const toast of document.querySelectorAll('#toast .toast-item')) {
    if (!visible(toast)) continue;
    for (const plate of document.querySelectorAll('#mapWrap,#topL,#feed .fd,#compass,#safe,#hOut,#banner,#matchMoment,#coach,#specBar,#bagTag,#consbar,#vitals,#ammoBox,#hotbar .hs,#killConfirm,#prompt,#use'))
      if (visible(plate) && overlaps(toast, plate)) faults.push(`toast overlaps ${label(plate)}`);
  }
  const banner = document.querySelector('#banner');
  if (visible(banner)) for (const plate of document.querySelectorAll('#mapWrap,#topL,#feed .fd,#compass,#safe,#hOut,#ammoBox,#hotbar .hs'))
    if (visible(plate) && overlaps(banner, plate)) faults.push(`banner overlaps ${label(plate)}`);
  return faults;
}
