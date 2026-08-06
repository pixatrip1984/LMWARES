const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const outputDir = path.join(process.cwd(), 'apps/public-web/public/assets/package-preview/admin');

const tasks = [
  {
    filename: 'admin-resumen.png',
    prompt: 'High-end luxury real estate portal admin dashboard overview UI, dark mode theme with deep navy and subtle orange accents, clean metric cards showing total sales, active leads, published developments, revenue chart, activity feed, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no watermarks, no logos'
  },
  {
    filename: 'admin-blog.png',
    prompt: 'Luxury corporate editorial blog management admin dashboard UI, dark mode theme, list of articles with publication status badges, article stats, search bar, filter dropdowns, editor preview panel on the right with featured image and rich text settings, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-galerias.png',
    prompt: 'High-end luxury architectural gallery manager admin dashboard UI, dark mode theme, grid of media collections with thumbnail previews, upload image button, image details inspector panel on the right with alt text, tag inputs and visibility toggle, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-catalogo.png',
    prompt: 'Luxury real estate property catalog management admin dashboard UI, dark mode theme, property developments data table with status indicators, search and filter bar, new development button, detailed property editor drawer on the right with unit inventory, amenities, and floor plans, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-solicitudes.png',
    prompt: 'High-touch client lead and quote requests management admin dashboard UI, dark mode theme, status tabs, contact request cards list on the left, detailed client inquiry details panel on the right showing contact info, message, requested property, and status action buttons, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-eventos.png',
    prompt: 'Luxury real estate events and private launch management admin dashboard UI, dark mode theme, calendar agenda view with upcoming investor forums and launch events, registration counter badge, event details panel with RSVP list and capacity progress bar, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-docs.png',
    prompt: 'Corporate documentation and investor library management admin dashboard UI, dark mode theme, organized category folders, document upload button, document metadata and access permissions panel on the right, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-compras.png',
    prompt: 'High-end e-commerce reservation and order management admin dashboard UI, dark mode theme, transaction log with order IDs, payment status badges, unit reservation summary, payment schedule breakdown panel on the right, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  },
  {
    filename: 'admin-optimization.png',
    prompt: 'Advanced site performance and analytics optimization admin dashboard UI, dark mode theme, interactive performance charts, page speed metrics, SEO scores, conversion funnel analytics, automated optimization recommendations list, sleek modern glassmorphic interface, 16:9 aspect ratio, high resolution UI mockup, no browser frame, no logos'
  }
];

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects if any
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (res) => {
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
        });
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function run() {
  for (const task of tasks) {
    console.log('Generating:', task.filename, '...');
    const cmd = `higgsfield generate create gpt_image_2 --prompt "${task.prompt.replace(/"/g, '\\"')}" --aspect_ratio 16:9 --wait --json`;
    try {
      const raw = execSync(cmd, { encoding: 'utf8' });
      const parsed = JSON.parse(raw);
      const mediaUrl = parsed[0]?.result_url || parsed[0]?.results?.[0]?.url || parsed[0]?.results?.[0]?.media_url || parsed[0]?.url;
      if (!mediaUrl) {
        console.error('Failed to get media URL for', task.filename, raw);
        continue;
      }
      const destPath = path.join(outputDir, task.filename);
      console.log('Downloading', mediaUrl, 'to', task.filename);
      await downloadImage(mediaUrl, destPath);
      console.log('Saved', task.filename);
    } catch (e) {
      console.error('Error generating', task.filename, e.message);
    }
  }
}

run().catch(console.error);
