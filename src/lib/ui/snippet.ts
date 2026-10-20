/** A search snippet as text and marked parts; a marker without its pair (a document may hold one) is dropped. */
export function snippetParts(snippet: string): Array<{ text: string; mark: boolean }> {
	return snippet
		.split(/\u0002([^\u0002\u0003]*)\u0003/)
		.map((text, i) => ({ text: text.replace(/[\u0002\u0003]/g, ''), mark: i % 2 === 1 }))
		.filter((p) => p.text);
}
