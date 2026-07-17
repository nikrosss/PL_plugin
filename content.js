// Forum Image Collector - Content Script

(function() {
  'use strict';

  // Extract topic ID from viewtopic.php URL
  function getTopicId(url) {
    try {
      const u = new URL(url);
      return u.searchParams.get('t');
    } catch {
      return null;
    }
  }

  // Find all topic links and their td.tt containers, deduplicated by topic ID
  function getTopics() {
    const seen = new Map(); // topicId -> entry
    document.querySelectorAll('a[href*="viewtopic.php"]').forEach(a => {
      const tid = getTopicId(a.href);
      if (!tid) return;
      if (seen.has(tid)) return;
      const row = a.closest('tr');
      const tt = row ? row.querySelector('td.tt') : null;
      seen.set(tid, { cell: tt || a.parentElement, url: a.href });
    });
    return [...seen.values()];
  }

  function normalizeUrl(u) {
    if (!u) return null;
    u = u.trim();
    if (!u) return null;
    if (u.startsWith('http://')) u = 'https://' + u.slice(7);
    return u;
  }

  // Fetch topic page and extract images
  async function getTopicImages(url) {
    try {
      const resp = await fetch(url, { credentials: 'same-origin' });
      const html = await resp.text();
      
      const tid = url.substring(url.lastIndexOf('=') + 1);
      console.log('[FIC] Fetched topic:', tid, '| html length:', html.length);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const images = [];
      const seen = new Set();
      
      function addImage(thumb, original) {
        thumb = normalizeUrl(thumb);
        original = normalizeUrl(original) || thumb;
        if (!thumb || seen.has(original)) return;
        seen.add(original);
        images.push({ thumb, original });
      }
      
      // 1) <var class="postImg"> contains original URL, sibling <img class="postImg"> is thumbnail
      const varTags = doc.querySelectorAll('var.postImg');
      for (const v of varTags) {
        const original = v.textContent.trim();
        if (!original) continue;
        // Find the paired img.postImg nearby (sibling or in same parent)
        let thumbnail = null;
        const parent = v.parentElement;
        if (parent) {
          const img = parent.querySelector('img.postImg');
          if (img) thumbnail = img.getAttribute('src');
          // Also check: img might be next sibling
          if (!thumbnail) {
            let sib = v.nextElementSibling;
            while (sib && sib !== parent.lastElementChild) {
              if (sib.tagName === 'IMG' && sib.classList.contains('postImg')) {
                thumbnail = sib.getAttribute('src');
                break;
              }
              sib = sib.nextElementSibling;
            }
          }
        }
        addImage(thumbnail || original, original);
      }
      
      // 2) Remaining img.postImg not yet captured
      for (const img of doc.querySelectorAll('img.postImg')) {
        const src = img.getAttribute('src');
        if (!src) continue;
        const absSrc = normalizeUrl(src);
        if (seen.has(absSrc)) continue;
        // Check if wrapped in <a> with original URL
        const parent = img.parentElement;
        let original = null;
        if (parent && parent.tagName === 'A') {
          const href = parent.getAttribute('href');
          if (href && /\.(jpg|jpeg|png|gif|webp)/i.test(href)) {
            original = href;
          }
        }
        addImage(src, original || src);
      }
      
      // 3) Fallback: broad regex for common image hosting services
      if (images.length === 0) {
        const hostPattern = [
          'fastpic', 'imgbox', 'imgchili', 'imgmega', 'postimages',
          'postimage', 'imageshack', 'pixhost', 'imgbb', 'imgur',
          'photobucket', 'imagebam', 'flickr', 'imgpile', 'freeimage',
          'thumbsnap', 'imgsen', 'imgsto', 'picsvr', 'picx'
        ].join('|');
        const regex = new RegExp(
          'https?://[^\\s"\'<>]+(?:' + hostPattern + ')[^\\s"\'<>]*\\.(?:jpg|jpeg|png|gif|webp)',
          'gi'
        );
        const matches = html.match(regex) || [];
        for (const src of matches) {
          addImage(src, src);
        }
      }
      
      // 4) Last resort: any <img> with image extension in src inside post content
      if (images.length === 0) {
        const postContent = doc.querySelectorAll('.post_body, .postbody, .post, .content');
        for (const post of postContent) {
          for (const img of post.querySelectorAll('img')) {
            const src = img.getAttribute('src');
            if (src && /\.(jpg|jpeg|png|gif|webp)/i.test(src)) {
              addImage(src, src);
            }
          }
        }
      }
      
      console.log('[FIC] Topic', tid, '- images found:', images.length);
      return images;
    } catch (e) {
      console.error('[FIC] Error:', url, e);
      return [];
    }
  }

  // Process all topics
  async function processPage() {
    const topics = getTopics();
    console.log('[FIC] Found', topics.length, 'topics');
    
    if (!topics.length) return;

    // Add styles
    const style = document.createElement('style');
    style.textContent = '.fic-imgs{display:flex;flex-wrap:wrap;gap:8px;padding:4px;margin:2px 0;max-height:300px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#888 transparent}.fic-imgs a{display:block;border:1px solid #ddd;border-radius:3px;overflow:hidden;flex-shrink:0;max-width:100%}.fic-imgs img{display:block;max-width:100%;height:auto}';
    document.head.appendChild(style);

    for (const topic of topics) {
      const images = await getTopicImages(topic.url);
      
      if (images.length && topic.cell) {
        const div = document.createElement('div');
        div.className = 'fic-imgs';
        div.innerHTML = images.map(img => 
          '<a href="' + img.original + '" target="_blank"><img src="' + img.thumb + '" loading="lazy"></a>'
        ).join('');
        
        topic.cell.appendChild(div);
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processPage);
  } else {
    processPage();
  }
})();
