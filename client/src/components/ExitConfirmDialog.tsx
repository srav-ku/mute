import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExitConfirmDialogProps {
  open: boolean;
  onResponse: (shouldExit: boolean) => void;
}

export function ExitConfirmDialog({ open, onResponse }: ExitConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onResponse(false)}>
      <AlertDialogContent data-testid="dialog-exit-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Exit Chat?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to exit? You will be logged out of the application.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onResponse(false)} data-testid="button-cancel-exit">
            Stay
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onResponse(true)} data-testid="button-confirm-exit">
            Exit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
