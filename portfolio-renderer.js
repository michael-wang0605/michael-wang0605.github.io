(() => {
  'use strict';
  const sections = ['work', 'research', 'life', 'archive'];
  const page = id => id === 'portfolio' ? 'portfolio.html' : `portfolio-${id}.html`;
  const entryPage = id => `portfolio-entry.html?entry=${encodeURIComponent(id)}`;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(text, href, className) {
    const node = el('a', className, text);
    node.href = href;
    return node;
  }

  function safeLink(url) {
    try {
      const parsed = new URL(url);
      return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null;
    } catch { return null; }
  }

  function media(block, data, assetUrl) {
    const asset = data.assets?.[block.asset];
    if (!asset) return el('p', 'archive-muted', 'Attachment unavailable.');
    const figure = el('figure', 'archive-figure');
    const url = assetUrl(block.asset);
    if (asset.type.startsWith('image/')) {
      const image = el('img');
      image.src = url;
      image.alt = block.alt || block.caption || asset.name;
      image.loading = 'lazy';
      image.decoding = 'async';
      figure.append(image);
    } else if (asset.type.startsWith('video/') || asset.type.startsWith('audio/')) {
      const player = el(asset.type.startsWith('video/') ? 'video' : 'audio');
      player.src = url;
      player.controls = true;
      player.preload = 'metadata';
      figure.append(player);
    } else if (asset.type === 'application/pdf') {
      const preview = el('object', 'archive-pdf');
      preview.type = 'application/pdf';
      preview.data = url;
      preview.setAttribute('aria-label', block.caption || asset.name);
      preview.append(el('p', '', 'Use the download link below to read this document.'));
      figure.append(preview);
    }
    const download = link(block.label || `download ${asset.name}`, url, 'archive-download');
    download.download = asset.name;
    figure.append(download);
    if (block.caption) figure.append(el('figcaption', '', block.caption));
    return figure;
  }

  function renderBlocks(article, blocks, data, assetUrl) {
    for (const block of blocks) {
      if (block.type === 'paragraph') article.append(el('p', '', block.text));
      if (block.type === 'heading') article.append(el('h2', '', block.text));
      if (block.type === 'list') {
        const list = el('ul');
        block.items.forEach(item => list.append(el('li', '', item)));
        article.append(list);
      }
      if (block.type === 'quote') {
        const quote = el('blockquote', '', block.text);
        if (block.attribution) quote.append(el('cite', '', block.attribution));
        article.append(quote);
      }
      if (block.type === 'media') article.append(media(block, data, assetUrl));
      if (block.type === 'gallery') {
        const gallery = el('div', 'archive-gallery');
        block.items.forEach(item => gallery.append(media(item, data, assetUrl)));
        article.append(gallery);
      }
      if (block.type === 'link') {
        const href = safeLink(block.url);
        if (href) {
          const row = el('p');
          const external = link(block.label + ' ↗', href, 'archive-external');
          external.target = '_blank';
          external.rel = 'noreferrer noopener';
          row.append(external);
          article.append(row);
        }
      }
      if (block.type === 'timeline') {
        const timeline = el('ol', 'archive-timeline');
        timeline.setAttribute('aria-label', 'Life timeline');
        block.items.forEach(item => {
          const moment = el('li');
          const date = el('time', '', item.date);
          if (/^\d{4}(-\d{2})?(-\d{2})?$/.test(item.datetime || '')) date.dateTime = item.datetime;
          const story = el('div');
          story.append(el('p', '', item.text));
          if (item.note) story.append(el('p', 'archive-muted', item.note));
          moment.append(date, story);
          timeline.append(moment);
        });
        article.append(timeline);
      }
    }
  }

  function header(parent, eyebrow, title, description) {
    const heading = el('header', 'archive-heading');
    heading.append(el('p', 'archive-eyebrow', eyebrow), el('h1', '', title));
    if (description) heading.append(el('p', 'archive-introduction', description));
    parent.append(heading);
  }

  function entryList(parent, entries) {
    if (!entries.length) {
      parent.append(el('p', 'archive-empty', 'Nothing collected here yet.'));
      return;
    }
    const list = el('ol', 'archive-entries');
    for (const entry of entries) {
      const row = el('li');
      const anchor = link('', entryPage(entry.id), 'archive-entry-link');
      const index = el('span', 'archive-entry-meta', entry.date || entry.kind || '');
      const copy = el('div', 'archive-entry-copy');
      copy.append(el('h2', '', entry.title), el('p', '', entry.summary));
      if (entry.kind) copy.append(el('span', 'archive-entry-kind', entry.kind));
      const arrow = el('span', 'archive-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      anchor.append(index, copy, arrow);
      row.append(anchor);
      list.append(row);
    }
    parent.append(list);
  }

  function render(container, data, { section = 'portfolio', entryId, assetUrl, lockButton }) {
    container.replaceChildren();
    const entry = section === 'entry' ? data.entries.find(item => item.id === entryId) : null;
    const activeSection = entry?.section || section;
    const toolbar = el('div', 'archive-toolbar');
    const nav = el('nav', 'archive-nav');
    nav.setAttribute('aria-label', 'Portfolio sections');
    for (const id of ['portfolio', ...sections]) {
      const anchor = link(id === 'portfolio' ? 'collection' : id, page(id));
      if (activeSection === id) anchor.setAttribute('aria-current', 'page');
      nav.append(anchor);
    }
    lockButton.hidden = false;
    toolbar.append(nav, lockButton);
    container.append(toolbar);

    if (section === 'portfolio') {
      header(container, 'a private collection', 'portfolio', data.introduction);
      const index = el('ol', 'archive-section-index');
      sections.forEach((id, number) => {
        const row = el('li');
        const anchor = link('', page(id));
        const count = data.entries.filter(item => item.section === id).length;
        const text = el('div', 'archive-section-copy');
        text.append(el('h2', '', id), el('p', '', data.sections[id].description));
        const detail = el('span', 'archive-section-count', `${String(count).padStart(2, '0')} ${count === 1 ? 'entry' : 'entries'}  ↗`);
        anchor.append(el('span', 'archive-number', String(number + 1).padStart(2, '0')), text, detail);
        row.append(anchor);
        index.append(row);
      });
      container.append(index);
      container.append(el('p', 'archive-colophon', 'collected over time. always a work in progress.'));
    } else if (sections.includes(section)) {
      header(container, 'portfolio / ' + section, section, data.sections[section].description);
      entryList(container, data.entries.filter(item => item.section === section));
    } else if (entry) {
      const back = link('← ' + entry.section, page(entry.section), 'archive-back');
      container.append(back);
      header(container, entry.kind || entry.section, entry.title, entry.summary);
      if (entry.metadata?.length) {
        const metadata = el('dl', 'archive-metadata');
        entry.metadata.forEach(item => {
          const pair = el('div');
          pair.append(el('dt', '', item.label), el('dd', '', item.value));
          metadata.append(pair);
        });
        container.append(metadata);
      }
      const article = el('article', 'archive-article');
      renderBlocks(article, entry.blocks, data, assetUrl);
      container.append(article);
      const siblings = data.entries.filter(item => item.section === entry.section);
      const position = siblings.findIndex(item => item.id === entry.id);
      const next = el('nav', 'archive-adjacent');
      next.setAttribute('aria-label', 'Other entries');
      if (position > 0) next.append(link('← ' + siblings[position - 1].title, entryPage(siblings[position - 1].id)));
      if (position < siblings.length - 1) next.append(link(siblings[position + 1].title + ' →', entryPage(siblings[position + 1].id)));
      container.append(next);
    } else {
      header(container, 'portfolio', 'entry unavailable', 'This entry is not in this collection.');
      container.append(link('← return to the collection', page('portfolio'), 'archive-back'));
    }
    return () => {
      container.querySelectorAll('audio, video').forEach(player => { player.pause(); player.removeAttribute('src'); player.load(); });
      container.replaceChildren();
    };
  }

  window.MWPortfolioRenderer = Object.freeze({ render });
})();
