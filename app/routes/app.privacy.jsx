import { Page, Card, Text, BlockStack } from "@shopify/polaris";

export default function Privacy() {
  return (
    <Page title="Privacy Policy">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Privacy Policy for GenieStock</Text>
          <Text variant="bodyMd" as="p">
            Last updated: June 2026
          </Text>

          <Text variant="headingSm" as="h3">Data We Collect</Text>
          <Text variant="bodyMd" as="p">
            When you install GenieStock, we access your Shopify store's product catalog, order history,
            and basic store information (shop domain, plan) solely for the purpose of detecting dead stock.
            We do not collect personal information about your customers.
          </Text>

          <Text variant="headingSm" as="h3">How We Use Your Data</Text>
          <Text variant="bodyMd" as="p">
            Your product and order data is used to: (1) scan inventory and flag unsold products, (2) generate
            dead stock insights and action suggestions, and
            (4) generate downloadable reports.
          </Text>

          <Text variant="headingSm" as="h3">Data Storage</Text>
          <Text variant="bodyMd" as="p">
            All store data is stored securely and is only accessible to your store and our application.
            We retain your data for as long as your app is installed. Upon uninstallation, all data
            associated with your store is permanently deleted within 30 days.
          </Text>

          <Text variant="headingSm" as="h3">Third-Party Sharing</Text>
          <Text variant="bodyMd" as="p">
            We do not sell, trade, or share your data with third parties. Data is processed solely
            within the Shopify ecosystem and our secure hosting infrastructure.
          </Text>

          <Text variant="headingSm" as="h3">Contact</Text>
          <Text variant="bodyMd" as="p">
            For privacy-related inquiries, contact the app developer through the Shopify App Store listing.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
