const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(

  process.env.SUPABASE_URL,

  process.env.SUPABASE_SERVICE_ROLE_KEY

);

module.exports = async (req, res) => {

  try {

    const { data, error } = await supabase

      .from('orders')

      .insert([

        {

          session_id: 'test_session',

          email: 'test@test.com',

          download_token: 'test_token_' + Date.now(),

          max_downloads: 3

        }

      ]);

    if (error) throw error;

    res.status(200).json({ success: true, data });

  } catch (err) {

    console.error(err);

    res.status(500).json({ error: err.message });

  }

};