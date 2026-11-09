import Image from "next/image";

const screens = [
  {
    src: "/screenshots/app-spools.jpg",
    alt: "Open Print mobile spool inventory with 13 spools, remaining weight and loaded printer",
    className: "phone-item phone-item-left",
  },
  {
    src: "/screenshots/app-spool.jpg",
    alt: "Open Print mobile spool detail for Bambu Green with 82 percent remaining and a P1S Garage location",
    className: "phone-item phone-item-center",
  },
  {
    src: "/screenshots/app-scan.jpg",
    alt: "Open Print mobile barcode scanner framing a Bambu filament box barcode",
    className: "phone-item phone-item-right",
  },
];

export function NativePhones() {
  return (
    <div className="phone-stage">
      <div
        className="phone-deck"
        role="list"
        aria-label="Open Print mobile app screens, demo data"
        tabIndex={0}
      >
        {screens.map((screen) => (
          <figure key={screen.src} className={screen.className} role="listitem">
            <div className="phone">
              <div className="phone-screen">
                <Image
                  src={screen.src}
                  alt={screen.alt}
                  width={1170}
                  height={2532}
                  sizes="(max-width: 767px) 72vw, 280px"
                  className="block h-auto w-full"
                />
              </div>
            </div>
          </figure>
        ))}
      </div>
      <p className="phone-caption">
        Inventory, spool detail and barcode scanning, demo data.
      </p>
    </div>
  );
}
