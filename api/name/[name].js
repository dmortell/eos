module.exports = (req, res) => {
	// With path segments, the value passed is made available to the req.query object under the key used for the file name.
  const {
    query: { name },
  } = req;

  res.send(`Hello ${name}!`);
};