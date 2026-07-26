import * as cheerio from 'cheerio';

export async function POST(req) {
    try {
        const { workshopUrl } = await req.json();

        if (!workshopUrl) {
            return new Response(JSON.stringify({ error: 'Workshop URL is required' }), { status: 400 });
        }

        // Fetch the Steam Workshop page
        const response = await fetch(workshopUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch workshop page: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const imageUrls = [];

        // 1. Steam Workshop main preview image
        const mainImage = $('#previewImageMain').attr('src') || $('.workshopItemPreviewImageMain').attr('src');
        if (mainImage && mainImage.startsWith('http')) {
            imageUrls.push(mainImage);
        }

        // 2. Additional screenshots in the highlight strip
        $('.highlight_strip_screenshot img').each((i, el) => {
            const src = $(el).attr('src');
            // Remove thumbnail suffix if needed or just keep raw
            if (src && src.startsWith('http') && !imageUrls.includes(src)) {
                imageUrls.push(src);
            }
        });

        // 3. Fallback: any other large preview images in the description
        $('.workshopItemDescription img').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.startsWith('http') && !imageUrls.includes(src)) {
                imageUrls.push(src);
            }
        });

        if (imageUrls.length === 0) {
            return new Response(JSON.stringify({ error: 'No preview images found on this page' }), { status: 404 });
        }

        return new Response(JSON.stringify({ imageUrls }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Error scraping workshop page:', error);
        return new Response(JSON.stringify({ error: 'Internal server error processing Workshop URL' }), { status: 500 });
    }
}
