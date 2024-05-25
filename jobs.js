import Agenda from "agenda";
import puppeteer from "puppeteer";
import bodyParser from "body-parser";
import cors from "cors"; // Import the cors middleware
const port = 3000;
import fs from "fs";
import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mongoConnectionString = 'mongodb://127.0.0.1/agenda';

mongoose.connect(mongoConnectionString, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const productSchema = new mongoose.Schema({
  url: String,
  imageUrl: String,
  name: String,
  priceOld: String,
  priceNew: String,
  shop: String,
});

const Product = mongoose.model('Product', productSchema);

// app.use(bodyParser.json()); // for parsing application/json
// app.use(cors());
const blockResourceType = [
  "beacon",
  "csp_report",
  "font",
  "imageset",
  "media",
  "object",
  "texttrack",
];
// we can also block by domains, like google-analytics etc.
const blockResourceName = [
  "adition",
  "adzerk",
  "analytics",
  "cdn.api.twitter",
  "clicksor",
  "clicktale",
  "doubleclick",
  "exelator",
  "facebook",
  "fontawesome",
  "google",
  "google-analytics",
  "googletagmanager",
  "mixpanel",
  "optimizely",
  "quantserve",
  "sharethrough",
  "tiqcdn",
  "zedo",
];
async function configurePage(page) {
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
  );

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const requestUrl = request.url().split("?")[0];
    if (
      blockResourceType.includes(request.resourceType()) ||
      blockResourceName.some((resource) => requestUrl.includes(resource))
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });
}

const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "agendaJobs" },
});

async function createBrowser() {
  return puppeteer.launch({
    headless: true, // Set to true for headless mode
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

async function scrapeHM() {
  const browser = await createBrowser();
  const page = await browser.newPage();
  await configurePage(page);
  await page.goto("https://www2.hm.com/en_gb/sale/ladies/view-all.html", {
    waitUntil: "domcontentloaded",
  });

  try {
    await page.waitForSelector("#onetrust-accept-btn-handler", {
      timeout: 3000,
    });
    await page.click("#onetrust-accept-btn-handler");
  } catch (error) {
    console.error(
      "Cookie acceptance dialog did not appear for Bershka, continuing..."
    );
  }
  await page.waitForSelector(".c04eed.ac3d9e.b19650");

  await page.evaluate(async () => {
    const distance = 1000; // distance to scroll
    const delay = 50; // delay in ms
    document.scrollingElement.scrollBy(0, distance);
    await new Promise((resolve) => setTimeout(resolve, delay));
  });


  const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".f0cf84"))
      .slice(0, 5)
      .map((element) => {
        const linkElement = element.querySelector(".db7c79");
        const imageElement = element.querySelector("img");

        return {
          url: linkElement ? linkElement.href : null,
          imageUrl: imageElement ? imageElement.src : null,
          name: imageElement ? imageElement.alt : null,
          priceOld: element.querySelector(".c04eed.ac3d9e.b19650")
            ? element.querySelector(".c04eed.ac3d9e.b19650").innerText
            : null,
          priceNew: element.querySelector(".aeecde.ac3d9e.aa21e8")
            ? element.querySelector(".aeecde.ac3d9e.aa21e8").innerText
            : null,
          shop: "H&M",
        };
      });
  });
  await browser.close();
  return products;
}

/////////////////////////////////////////////////////

async function scrapeZaraOnSale() {
  const browser = await createBrowser();
  const page = await browser.newPage();
  await configurePage(page);

  await page.goto(
    "https://www.zara.com/hu/en/woman-special-prices-l1314.html?v1=2353821",
    {
      waitUntil: "domcontentloaded",
    }
  );

  try {
    await page.waitForSelector("#onetrust-accept-btn-handler", {
      timeout: 3000,
    });
    await page.click("#onetrust-accept-btn-handler");
  } catch (error) {
    console.error("Cookie acceptance dialog did not appear, continuing...");
  }

  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });
  await page.evaluate(async () => {
    const distance = 1000; // distance to scroll
    const delay = 50; // delay in ms
    document.scrollingElement.scrollBy(0, distance);
    await new Promise((resolve) => setTimeout(resolve, delay));
  });
  // Scrape the product details
  await page.waitForSelector(".media-image__image.media__wrapper--media");
  const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".product-grid-product"))
      .slice(0, 5)
      .map((element) => {
        const linkElement = element.querySelector(".product-link");
        const imageElement = element.querySelector(
          ".media-image__image.media__wrapper--media"
        );
        const captionElement = element.querySelector("h2");
        return {
          url: linkElement ? linkElement.href : null,
          imageUrl: imageElement
            ? imageElement.src.replace(/w=\d+/, "w=660")
            : null,
          name: captionElement ? captionElement.innerText : null,
          priceOld: element.querySelector(".price-old__amount.price__amount.price__amount-old > .money-amount.price-formatted__price-amount > .money-amount__main")
              ? element.querySelector(".price-old__amount.price__amount.price__amount-old > .money-amount.price-formatted__price-amount > .money-amount__main").innerText
              : null,
            priceNew: element.querySelector(".price-current__amount > .money-amount.price-formatted__price-amount > .money-amount__main")
              ? element.querySelector(".price-current__amount > .money-amount.price-formatted__price-amount > .money-amount__main").innerText
              : null,
          shop: "Zara",
        };
      });
  });
  await browser.close();
  return products;
}



agenda.define("scrape_sm", async () => {

  const [zaraProducts, hmProducts, stradivariusProducts] =
      await Promise.all([
        scrapeZaraOnSale(),
        scrapeHM(),
        //scrapeStradivarius(),
        //scrapeNike(searchQuery)
      ]);
    const allProducts = [...zaraProducts, ...hmProducts];

  console.log(allProducts);
  await Product.deleteMany({});
  await Product.insertMany(allProducts);

  console.log('Products have been scraped and stored in MongoDB');
  //fs.writeFileSync("hmOnSale.json", JSON.stringify(allProducts, null, "\t"));
});

await agenda.start();

await agenda.every("8 minutes", "scrape_sm");

async function graceful() {
  await agenda.stop();
  process.exit(0);
}

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);


// Express route to get on sale products
app.get('/products/onSale', async (req, res) => {
    try {
      const products = await Product.find({});
      res.json({ data: products });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });