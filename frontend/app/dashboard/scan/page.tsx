import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Barcode scanning moved to the mobile app</CardTitle>
          <CardDescription>
            The web dashboard no longer opens the camera. Scan a Bambu Lab box
            with the OpenPrintDash app for iOS or Android; known barcodes create
            the filament and spool for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/spools" />}
          >
            Go to Spools
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
