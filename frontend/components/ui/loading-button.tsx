import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function LoadingButton({
  loading,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button disabled={loading || disabled} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </Button>
  );
}

export { LoadingButton };
