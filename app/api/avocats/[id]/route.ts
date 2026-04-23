import { NextResponse } from "next/server";
import { deleteAvocat, updateAvocat } from "@/lib/avocats";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const avocat = await updateAvocat(id, payload);

    return NextResponse.json({
      message: "Avocat updated successfully.",
      avocat
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update avocat."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const { id } = await context.params;
    await deleteAvocat(id);

    return NextResponse.json({
      message: "Avocat deleted successfully."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete avocat."
      },
      { status: 400 }
    );
  }
}
