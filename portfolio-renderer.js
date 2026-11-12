(() => {
  'use strict';
  const sections = ['work', 'research', 'side-quests', 'life', 'archive'];
  const label = id => id === 'side-quests' ? 'side quests' : id;
  const years = value => [...new Set(String(value || '').match(/\b(?:19|20)\d{2}\b/g) || [])].join('–');
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
    if (!asset.type.startsWith('image/') || block.download) {
      const download = link(block.label || `download ${asset.name}`, url, 'archive-download');
      download.download = asset.name;
      figure.append(download);
    }
    if (block.caption) figure.append(el('figcaption', '', block.caption));
    return figure;
  }

  function renderBlocks(article, blocks, data, assetUrl) {
    for (const block of blocks) {
      if (block.type === 'paragraph') article.append(el('p', '', block.text));
      if (block.type === 'note' || block.type === 'media-slot') {
        const note = el(block.collapsed ? 'details' : 'aside', block.collapsed ? 'archive-disclosure' : block.type === 'media-slot' ? 'archive-media-slot' : 'archive-note');
        if (block.label) note.append(el(block.collapsed ? 'summary' : 'p', 'archive-note-label', block.label));
        note.append(el('p', '', block.text));
        article.append(note);
      }
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
          const date = el('time', '', years(item.date));
          const year = years(item.datetime);
          if (/^\d{4}$/.test(year)) date.dateTime = year;
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
    if (eyebrow) heading.append(el('p', 'archive-eyebrow', eyebrow));
    heading.append(el('h1', '', title));
    if (description) {
      const introduction = el('div', 'archive-introduction');
      description.split(/\n\s*\n/).forEach(text => introduction.append(el('p', '', text)));
      heading.append(introduction);
    }
    parent.append(heading);
  }

  function entryList(parent, entries, section) {
    if (!entries.length) {
      parent.append(el('p', 'archive-empty', 'Nothing collected here yet.'));
      return;
    }
    const list = el('ol', `archive-entries${section === 'archive' || section === 'side-quests' ? ' archive-compact' : ''}${section === 'research' ? ' archive-research' : ''}${section === 'side-quests' ? ' archive-quests' : ''}`);
    for (const [number, entry] of entries.entries()) {
      const row = el('li');
      const anchor = entry.inline ? el('div', 'archive-entry-link archive-inline-entry') : link('', entryPage(entry.id), 'archive-entry-link');
      const index = el('span', 'archive-entry-meta', years(entry.date));
      if (section === 'work' || section === 'research') {
        index.textContent = '';
        index.append(el('span', 'archive-entry-number', String(number + 1).padStart(2, '0') + ' /'), el('span', '', years(entry.date)));
      }
      if (entry.status && section !== 'side-quests') index.append(el('span', 'archive-entry-status', entry.status));
      const copy = el('div', 'archive-entry-copy');
      copy.append(el('h2', '', entry.title));
      if (entry.kind && !entry.secondary) copy.append(el('span', 'archive-entry-kind', entry.kind));
      copy.append(el('p', '', entry.summary));
      if (entry.signal) copy.append(el('span', 'archive-entry-signal', entry.signal));
      const arrow = el('span', 'archive-arrow', '→');
      arrow.setAttribute('aria-hidden', 'true');
      anchor.append(index, copy);
      if (!entry.inline) anchor.append(arrow);
      row.append(anchor);
      list.append(row);
    }
    parent.append(list);
  }

  function render(container, data, { section = 'portfolio', entryId, assetUrl, lockButton }) {
    const previousNavScroll = container.querySelector?.('.archive-nav')?.scrollLeft || 0;
    container.replaceChildren();
    const entry = section === 'entry' ? data.entries.find(item => item.id === entryId) : null;
    const activeSection = entry?.section || section;
    container.dataset.view = section;
    const top = el('div', 'archive-view-top');
    top.id = 'portfolio-view-top';
    container.append(top);
    const toolbar = el('div', 'archive-toolbar');
    const nav = el('nav', 'archive-nav');
    nav.setAttribute('aria-label', 'Portfolio sections');
    for (const id of ['portfolio', ...sections]) {
      const anchor = link(id === 'portfolio' ? 'index' : label(id), page(id));
      if (activeSection === id) anchor.setAttribute('aria-current', 'page');
      nav.append(anchor);
    }
    lockButton.hidden = false;
    lockButton.setAttribute('aria-label', 'Lock portfolio');
    lockButton.title = 'Lock portfolio';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'archive-lock-icon');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.2');
    icon.setAttribute('aria-hidden', 'true');
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    outline.setAttribute('d', 'M5 7V5a3 3 0 0 1 6 0v2M4 7h8a1 1 0 0 1 1 1v5H3V8a1 1 0 0 1 1-1Z');
    icon.append(outline);
    lockButton.replaceChildren(icon, el('span', 'archive-lock-label', 'lock'));
    toolbar.append(nav, lockButton);
    container.append(toolbar);

    if (section === 'portfolio') {
      header(container, '', 'portfolio', data.introduction);
      if (data.credentialLine) container.append(el('p', 'archive-credentials', data.credentialLine));
      const index = el('ol', 'archive-section-index');
      sections.forEach((id, number) => {
        const row = el('li');
        const anchor = link('', page(id));
        const text = el('div', 'archive-section-copy');
        text.append(el('h2', '', label(id)), el('p', '', data.sections[id].description.split(/\n\s*\n/)[0]));
        const detail = el('span', 'archive-section-count', '→');
        detail.setAttribute('aria-hidden', 'true');
        anchor.append(el('span', 'archive-number', String(number + 1).padStart(2, '0')), text, detail);
        row.append(anchor);
        index.append(row);
      });
      container.append(index);
    } else if (sections.includes(section)) {
      header(container, '', label(section), data.sections[section].description);
      const entries = data.entries.filter(item => item.section === section);
      if (section === 'life' && data.sections.life.groups?.length) {
        const jumps = el('nav', 'archive-jumps');
        jumps.setAttribute('aria-label', 'Life collections');
        if (data.sections.life.blocks?.length) jumps.append(link('photographs', '#portfolio-photographs'));
        data.sections.life.groups.forEach((group, index) => jumps.append(link(group.title, '#portfolio-life-' + index)));
        container.append(jumps);
      }
      if (data.sections[section].blocks?.length) {
        const introduction = el('div', 'archive-section-media');
        introduction.id = 'portfolio-photographs';
        renderBlocks(introduction, data.sections[section].blocks, data, assetUrl);
        container.append(introduction);
      }
      if (section === 'life' && data.sections.life.groups?.length) {
        for (const [index, group] of data.sections.life.groups.entries()) {
          const records = (group.entries || []).map(id => data.entries.find(item => item.id === id)).filter(Boolean);
          if (!records.length) continue;
          const collection = el('section', 'archive-life-group');
          collection.id = 'portfolio-life-' + index;
          collection.append(el('h2', '', group.title));
          entryList(collection, records);
          container.append(collection);
        }
      } else if (section === 'archive') {
        entryList(container, entries.filter(item => !item.reference), section);
        const references = entries.filter(item => item.reference);
        if (references.length) {
          const shelf = el('details', 'archive-reference-shelf');
          shelf.append(el('summary', '', 'documents & earlier versions'));
          entryList(shelf, references, section);
          container.append(shelf);
        }
      } else {
        entryList(container, entries.filter(item => !item.secondary), section);
        const secondary = entries.filter(item => item.secondary);
        if (secondary.length) {
          container.append(el('h2', 'archive-subheading', 'working papers'));
          entryList(container, secondary, section);
        }
      }
    } else if (entry) {
      const layout = el('div', 'archive-reading-layout');
      const reading = el('div', 'archive-reading-copy');
      const rail = el('aside', 'archive-reading-rail');
      const back = link('← all ' + label(entry.section), page(entry.section), 'archive-back');
      reading.append(back);
      header(reading, [entry.kind || label(entry.section), years(entry.date), entry.status].filter(Boolean).join(' · '), entry.title, entry.summary);
      if (entry.signal) reading.append(el('p', 'archive-entry-signal archive-detail-signal', entry.signal));
      if (entry.metadata?.length) {
        const metadata = el('dl', 'archive-metadata');
        entry.metadata.forEach(item => {
          const pair = el('div');
          pair.append(el('dt', '', item.label), el('dd', '', item.value));
          metadata.append(pair);
        });
        reading.append(metadata);
      }
      const article = el('article', 'archive-article');
      const headings = entry.blocks.filter(block => block.type === 'heading');
      if (headings.length > 3) {
        const contents = el('details', 'archive-contents');
        contents.open = false;
        contents.append(el('summary', '', 'on this page'));
        const links = el('nav');
        links.setAttribute('aria-label', 'On this page');
        headings.forEach((block, number) => links.append(link(block.text, '#portfolio-part-' + number)));
        contents.append(links);
        rail.append(contents);
      }
      renderBlocks(article, entry.blocks, data, assetUrl);
      article.querySelectorAll('h2').forEach((node, number) => { node.id = 'portfolio-part-' + number; });
      reading.append(article);
      const siblings = data.entries.filter(item => item.section === entry.section);
      const position = siblings.findIndex(item => item.id === entry.id);
      const next = el('nav', 'archive-adjacent');
      next.setAttribute('aria-label', 'Other entries');
      if (position > 0) {
        const previous = link('', entryPage(siblings[position - 1].id));
        previous.append(el('span', '', '← previous'), el('strong', '', siblings[position - 1].title));
        next.append(previous);
      }
      if (position < siblings.length - 1) {
        const following = link('', entryPage(siblings[position + 1].id));
        following.append(el('span', '', 'next →'), el('strong', '', siblings[position + 1].title));
        next.append(following);
      }
      reading.append(next);
      if (headings.length > 3) layout.append(rail);
      layout.append(reading);
      container.append(layout);
    } else {
      header(container, 'portfolio', 'entry unavailable', 'This entry is not in this collection.');
      container.append(link('← return to the collection', page('portfolio'), 'archive-back'));
    }
    const footer = el('footer', 'archive-footer');
    footer.append(link('↑ back to top', '#portfolio-view-top'));
    container.append(footer);
    if (typeof nav.clientWidth === 'number') {
      nav.scrollLeft = previousNavScroll;
      const active = Array.from(nav.children).find(node => node.getAttribute('aria-current') === 'page');
      if (active && active.offsetLeft < nav.scrollLeft) nav.scrollLeft = active.offsetLeft;
      if (active && active.offsetLeft + active.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = active.offsetLeft + active.offsetWidth - nav.clientWidth;
    }
    return () => {
      container.querySelectorAll('audio, video').forEach(player => { player.pause(); player.removeAttribute('src'); player.load(); });
      container.replaceChildren();
    };
  }

  window.MWPortfolioRenderer = Object.freeze({ render });
})();
