const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Region and credentials are automatically loaded from the Lambda environment
const s3Client = new S3Client({ region: process.env.AWS_REGION });

module.exports.getS3PreSignedUrl = async function getS3PreSignedUrl(
  s3ObjectKey,
  bucketName = process.env.S3_BUCKET_NAME,
) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: `${process.env.STAGE}/${s3ObjectKey}`,
  });

  // the Expires is capped for 1 minute (60 * 10 was 600 seconds = 10 minutes in v2? The comment says "capped for 1 minute" but code said 60*10 which is 600. Let's keep 600 if that was the intent, or follow the comment?)
  // Original code: Expires: 60 * 10, // the Expires is capped for 1 minute
  // 60 * 10 = 600 seconds = 10 minutes.
  // I will use expiresIn: 600 to match the value, not the comment which might be outdated.

  const s3PreSignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 600,
  });

  console.log(`Util.s3PreSignedUrl: ${s3ObjectKey} URL ${s3PreSignedUrl}`);
  return s3PreSignedUrl;
};
