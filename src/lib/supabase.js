import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ldhnbqhfsyslunyahcci.supabase.co";

const supabasePublishableKey =
  "sb_publishable_Zli8CTCzTA4VaTncxZPV6w_fa1VbmhS";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
