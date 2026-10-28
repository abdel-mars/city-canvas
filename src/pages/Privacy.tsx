import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const CONTACT_EMAIL = "citylinesart@gmail.com";

const Privacy = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = "Privacy Policy — City Lines";
    window.scrollTo({ top: 0 });
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to City Lines
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <div className="border-b border-border/70 pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            City Lines
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            How City Lines Art collects, uses, and protects information when you use
            citylines-art.vercel.app and our related services.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">Last updated: October 28, 2026</p>
        </div>

        <div className="mt-8 rounded-2xl border border-border/70 bg-card/40 p-5 text-sm leading-7 text-muted-foreground">
          In short: we collect the information needed to create and share your city artwork,
          process print orders, keep the service secure, and publish our own artwork to our own
          social accounts. We do not sell your personal information or use advertising trackers.
        </div>

        <div className="mt-10 space-y-10 text-sm leading-7">
          <section id="scope">
            <h2 className="text-xl font-semibold tracking-tight">1. Who we are and what this covers</h2>
            <p className="mt-3 text-muted-foreground">
              City Lines Art (“City Lines”, “we”, “us”, or “our”) operates the City Lines website
              and related services. This policy applies when you visit the site, create or share
              artwork, sign in, contact us, or buy a print. It does not apply to Pinterest,
              Instagram, Fourthwall, or other third-party sites, which have their own privacy
              policies.
            </p>
            <p className="mt-3 text-muted-foreground">
              For purposes of the EU and UK General Data Protection Regulation, City Lines Art is
              the controller of the personal data described in this policy.
            </p>
          </section>

          <section id="collection">
            <h2 className="text-xl font-semibold tracking-tight">2. Information we collect</h2>

            <h3 className="mt-5 font-semibold">Account information</h3>
            <p className="mt-2 text-muted-foreground">
              When you sign in, we collect your email address and any optional username you
              provide. Authentication is handled through Supabase using single-use magic links, so
              we do not store a password for you. If you complete a profile, we may also store
              profile details such as an avatar URL, bio, or print link.
            </p>

            <h3 className="mt-5 font-semibold">Artwork and shared content</h3>
            <p className="mt-2 text-muted-foreground">
              We process the city and country you select, your design settings, generated artwork,
              image files, titles, descriptions, and related metadata. If you create a share link,
              the shared artwork and the creator name and email associated with it may be stored so
              the link can be displayed.
            </p>

            <h3 className="mt-5 font-semibold">Social publishing information</h3>
            <p className="mt-2 text-muted-foreground">
              If an authorized administrator connects a City Lines social account, we store the
              OAuth access and refresh tokens, account and board identifiers, scheduled post
              details, and the external post identifiers returned by the platform. We use this
              information only to publish City Lines artwork to the connected City Lines account.
              We do not access other users’ Pinterest or Instagram data.
            </p>

            <h3 className="mt-5 font-semibold">Orders and payments</h3>
            <p className="mt-2 text-muted-foreground">
              Print checkout, payment processing, and fulfillment are handled by Fourthwall and its
              payment providers. We do not receive or store your full payment-card details. We may
              receive order, product, and shipping information needed to fulfill your order or
              respond to a support request.
            </p>

            <h3 className="mt-5 font-semibold">Technical and usage information</h3>
            <p className="mt-2 text-muted-foreground">
              Our hosting and infrastructure providers may automatically process technical data
              such as your IP address, browser type, device information, requested pages,
              timestamps, and error logs. We use IP addresses for security, abuse prevention, and
              rate limiting. We do not use this information for advertising.
            </p>

            <h3 className="mt-5 font-semibold">Communications</h3>
            <p className="mt-2 text-muted-foreground">
              If you contact us, we receive your email address and the contents of your message so
              we can respond and keep a record of the request.
            </p>
          </section>

          <section id="use">
            <h2 className="text-xl font-semibold tracking-tight">3. How we use information</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Provide the website, generate artwork, and operate share links.</li>
              <li>Authenticate you and maintain your session.</li>
              <li>Publish City Lines artwork to our own connected social accounts.</li>
              <li>Prepare products, process orders, and support fulfillment through Fourthwall.</li>
              <li>Protect the service, prevent abuse, and enforce rate limits.</li>
              <li>Respond to questions, requests, and support messages.</li>
              <li>Maintain logs, troubleshoot errors, and improve the service.</li>
              <li>Comply with legal obligations and enforce our rights.</li>
            </ul>
          </section>

          <section id="legal-bases">
            <h2 className="text-xl font-semibold tracking-tight">4. Legal bases for processing</h2>
            <p className="mt-3 text-muted-foreground">
              Where EU or UK data protection law applies, we rely on one or more of the following
              legal bases: performance of a contract when providing the service or fulfilling an
              order; legitimate interests in operating, securing, and improving City Lines;
              consent where we ask for it; and legal obligation where we must retain or disclose
              information.
            </p>
          </section>

          <section id="sharing">
            <h2 className="text-xl font-semibold tracking-tight">5. When we share information</h2>
            <p className="mt-3 text-muted-foreground">
              We share information only as needed to run City Lines, with service providers that
              process it on our behalf or as required by law. These providers include:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Supabase</strong> for authentication, database,
                and file storage.
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> for hosting, serverless
                functions, and operational logs.
              </li>
              <li>
                <strong className="text-foreground">Fourthwall</strong> for storefront, payment
                processing, and print fulfillment.
              </li>
              <li>
                <strong className="text-foreground">Pinterest and Instagram</strong> when we publish
                City Lines artwork to our own connected accounts. We do not share your personal
                information with them for advertising.
              </li>
              <li>
                <strong className="text-foreground">OpenStreetMap and Overpass</strong> when the app
                requests map data for the city you select.
              </li>
              <li>
                <strong className="text-foreground">Google Fonts</strong> when your browser loads the
                site’s typefaces.
              </li>
              <li>
                <strong className="text-foreground">Upstash</strong> for rate limiting and abuse
                protection.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              We may also disclose information if required by law, to protect the rights and safety
              of City Lines or others, or as part of a business transfer. We do not sell personal
              information.
            </p>
          </section>

          <section id="cookies">
            <h2 className="text-xl font-semibold tracking-tight">6. Cookies and local storage</h2>
            <p className="mt-3 text-muted-foreground">
              The app uses browser local storage to remember your theme preference and to keep your
              Supabase authentication session. Our providers may set necessary cookies for
              authentication, security, and routing. We do not use advertising cookies or
              cross-site tracking technologies. You can clear local storage or sign out at any time;
              clearing storage may sign you out and reset your preferences.
            </p>
          </section>

          <section id="retention">
            <h2 className="text-xl font-semibold tracking-tight">7. Retention</h2>
            <p className="mt-3 text-muted-foreground">
              We retain account and artwork information while your account is active or as needed
              to provide the service. If artwork is queued for social publishing, seven days after
              its last successful post we replace the high-resolution original with a 640-pixel
              preview; the share record and preview remain until deleted. Social publishing
              variants are removed after publishing or by routine cleanup. Authentication sessions
              expire or end when you sign out. Logs and order records are retained according to our
              providers’ settings and applicable legal requirements. You may contact us to request
              deletion of your account or personal information.
            </p>
          </section>

          <section id="security">
            <h2 className="text-xl font-semibold tracking-tight">8. Security</h2>
            <p className="mt-3 text-muted-foreground">
              We use access controls, encrypted connections, and reputable infrastructure providers
              to protect information. No method of transmission or storage is completely secure, so
              we cannot guarantee absolute security. If you believe your information has been
              compromised, contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-foreground underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section id="rights">
            <h2 className="text-xl font-semibold tracking-tight">9. Your rights</h2>
            <p className="mt-3 text-muted-foreground">
              Depending on where you live, you may have the right to access, correct, delete, or
              receive a copy of your personal information; to restrict or object to certain
              processing; to withdraw consent; and to lodge a complaint with your local data
              protection authority. California residents may also have rights under California
              privacy law, including the right not to be discriminated against for exercising those
              rights. To make a request, email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-foreground underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              . We may ask for information to verify your identity before responding.
            </p>
          </section>

          <section id="children">
            <h2 className="text-xl font-semibold tracking-tight">10. Children</h2>
            <p className="mt-3 text-muted-foreground">
              City Lines is not directed to children. We do not knowingly collect personal
              information from children under 13, or under the minimum age required in your
              country. If you believe a child has provided us with personal information, contact us
              and we will take appropriate steps to delete it.
            </p>
          </section>

          <section id="transfers">
            <h2 className="text-xl font-semibold tracking-tight">11. International transfers</h2>
            <p className="mt-3 text-muted-foreground">
              Our providers may process information in the European Union, the United States, and
              other countries. Where required, we rely on appropriate safeguards such as standard
              contractual clauses and our providers’ data processing terms.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-xl font-semibold tracking-tight">12. Changes to this policy</h2>
            <p className="mt-3 text-muted-foreground">
              We may update this policy to reflect changes in the service, our providers, or
              applicable law. When we do, we will update the date at the top of this page. Continued
              use of City Lines after an update means you have read the revised policy.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-semibold tracking-tight">13. Contact us</h2>
            <p className="mt-3 text-muted-foreground">
              For privacy questions or requests, contact City Lines Art at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-foreground underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-border/70 pt-6 text-xs text-muted-foreground">
          <Link to="/" className="underline underline-offset-4 hover:text-foreground">
            Return to City Lines
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Privacy;
