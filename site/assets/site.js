document.documentElement.classList.add('js');

// Reveal on scroll; the CSS only hides [data-reveal] when motion is welcome.
const io = new IntersectionObserver((entries) => {
	for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

// Editor / raw toggle on the product shot.
document.querySelectorAll('.toggle button').forEach((b) => b.addEventListener('click', () => {
	const shown = b.dataset.show;
	b.parentElement.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
	document.querySelectorAll('.screens img').forEach((img) => { img.hidden = img.dataset.view !== shown; });
}));

// Copy buttons: copy the text of the <pre> in the same card, minus prompts.
document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', async () => {
	const text = b.closest('.card').querySelector('pre').innerText.replace(/^\$ /gm, '');
	const label = b.textContent;
	try { await navigator.clipboard.writeText(text); b.textContent = b.dataset.done; } catch { b.textContent = b.dataset.fail; }
	setTimeout(() => { b.textContent = label; }, 1600);
}));
