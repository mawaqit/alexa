const AWS = require("aws-sdk");

module.exports.getS3PreSignedUrl = async function getS3PreSignedUrl(
  s3ObjectKey,
  bucketName = process.env.s3bucketName
) {
  const s3SigV4Client = new AWS.S3({
    signatureVersion: "v4",
    region: process.env.awsRegion,
  });
  const s3PreSignedUrl = await s3SigV4Client.getSignedUrl("getObject", {
    Bucket: bucketName,
    Key: `${process.env.stage}/${s3ObjectKey}`,
    Expires: 60 * 10, // the Expires is capped for 1 minute
  });
  console.log(`Util.s3PreSignedUrl: ${s3ObjectKey} URL ${s3PreSignedUrl}`);
  return s3PreSignedUrl;
  // return s3PreSignedUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};
