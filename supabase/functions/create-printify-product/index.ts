import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRINTIFY_BASE = "https://api.printify.com/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PRINTIFY_API_KEY = Deno.env.get("PRINTIFY_API_KEY");
    if (!PRINTIFY_API_KEY) {
      throw new Error("PRINTIFY_API_KEY is not configured");
    }

    const STORE_DOMAIN = Deno.env.get("PRINTIFY_STORE_DOMAIN");
    if (!STORE_DOMAIN) {
      throw new Error("PRINTIFY_STORE_DOMAIN is not configured");
    }

    const { image_base64, title, description } = await req.json();
    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: "image_base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = {
      Authorization: `Bearer ${PRINTIFY_API_KEY}`,
      "Content-Type": "application/json",
    };

    // 1. Get shops
    console.log("Fetching shops...");
    const shopsRes = await fetch(`${PRINTIFY_BASE}/shops.json`, { headers });
    if (!shopsRes.ok) {
      const body = await shopsRes.text();
      throw new Error(`Failed to fetch shops [${shopsRes.status}]: ${body}`);
    }
    const shops = await shopsRes.json();
    if (!shops.length) {
      throw new Error("No Printify shops found. Please create a shop at printify.com first.");
    }
    const shopId = shops[0].id;
    console.log(`Using shop: ${shops[0].title} (${shopId})`);

    // 2. Upload image
    console.log("Uploading artwork image...");
    const uploadRes = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        file_name: `citylines-artwork-${Date.now()}.png`,
        contents: image_base64,
      }),
    });
    if (!uploadRes.ok) {
      const body = await uploadRes.text();
      throw new Error(`Image upload failed [${uploadRes.status}]: ${body}`);
    }
    const uploadData = await uploadRes.json();
    const imageId = uploadData.id;
    console.log(`Image uploaded: ${imageId}`);

    // 3. Find poster blueprint from catalog
    console.log("Searching catalog for poster blueprints...");
    const catalogRes = await fetch(`${PRINTIFY_BASE}/catalog/blueprints.json`, { headers });
    if (!catalogRes.ok) {
      const body = await catalogRes.text();
      throw new Error(`Catalog fetch failed [${catalogRes.status}]: ${body}`);
    }
    const blueprints = await catalogRes.json();

    const posterBlueprint = blueprints.find(
      (bp: any) =>
        bp.title.toLowerCase().includes("poster") &&
        bp.title.toLowerCase().includes("matte")
    ) ||
      blueprints.find((bp: any) => bp.title.toLowerCase().includes("poster")) ||
      blueprints.find((bp: any) => bp.title.toLowerCase().includes("art print"));

    if (!posterBlueprint) {
      throw new Error("No poster blueprint found in Printify catalog");
    }
    console.log(`Using blueprint: ${posterBlueprint.title} (${posterBlueprint.id})`);

    // 4. Get print providers for this blueprint
    const providersRes = await fetch(
      `${PRINTIFY_BASE}/catalog/blueprints/${posterBlueprint.id}/print_providers.json`,
      { headers }
    );
    if (!providersRes.ok) {
      const body = await providersRes.text();
      throw new Error(`Providers fetch failed [${providersRes.status}]: ${body}`);
    }
    const providers = await providersRes.json();
    if (!providers.length) {
      throw new Error("No print providers found for this blueprint");
    }
    const provider = providers[0];
    console.log(`Using provider: ${provider.title} (${provider.id})`);

    // 5. Get variants for this provider
    const variantsRes = await fetch(
      `${PRINTIFY_BASE}/catalog/blueprints/${posterBlueprint.id}/print_providers/${provider.id}/variants.json`,
      { headers }
    );
    if (!variantsRes.ok) {
      const body = await variantsRes.text();
      throw new Error(`Variants fetch failed [${variantsRes.status}]: ${body}`);
    }
    const variantsData = await variantsRes.json();
    const variants = variantsData.variants || variantsData;
    if (!variants?.length) {
      throw new Error("No variants found");
    }

    const selectedVariants = variants.slice(0, Math.min(variants.length, 5));
    console.log(`Selected ${selectedVariants.length} variants`);

    // 6. Create the product
    console.log("Creating product...");
    const productPayload = {
      title: title || "City Lines Art Poster",
      description:
        description ||
        "A minimal road-network artwork. Beautiful wall art celebrating the unique street layout of a city.",
      blueprint_id: posterBlueprint.id,
      print_provider_id: provider.id,
      variants: selectedVariants.map((v: any) => ({
        id: v.id,
        price: 2999,
        is_enabled: true,
      })),
      print_areas: [
        {
          variant_ids: selectedVariants.map((v: any) => v.id),
          placeholders: [
            {
              position: "front",
              images: [
                {
                  id: imageId,
                  x: 0.5,
                  y: 0.5,
                  scale: 1,
                  angle: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const productRes = await fetch(
      `${PRINTIFY_BASE}/shops/${shopId}/products.json`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(productPayload),
      }
    );
    if (!productRes.ok) {
      const body = await productRes.text();
      throw new Error(`Product creation failed [${productRes.status}]: ${body}`);
    }
    const product = await productRes.json();
    console.log(`Product created: ${product.id}`);

    // 7. Publish the product to the Pop-Up Store
    console.log("Publishing product...");
    const publishRes = await fetch(
      `${PRINTIFY_BASE}/shops/${shopId}/products/${product.id}/publish.json`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: true,
          description: true,
          images: true,
          variants: true,
          tags: true,
          keyFeatures: true,
          shipping_template: true,
        }),
      }
    );
    if (!publishRes.ok) {
      const body = await publishRes.text();
      console.warn(`Publish warning [${publishRes.status}]: ${body}`);
    } else {
      const publishData = await publishRes.json();
      console.log("Product published successfully:", JSON.stringify(publishData));
    }

    // 8. Construct the Pop-Up Store product URL
    const productUrl = `https://${STORE_DOMAIN}.printify.me/product/${product.id}`;
    console.log(`Product URL: ${productUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id: product.id,
        product_url: productUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Printify error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});